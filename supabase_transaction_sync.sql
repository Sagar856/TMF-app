-- Apply after supabase_schema.sql and the updated
-- supabase_background_payments.sql, before deploying the matching app.
-- Transaction mutations use revision-checked RPCs. Direct/legacy writes are
-- rejected so a stale snapshot cannot overwrite a newer transaction.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sync_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS category_origin TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE public.transactions ALTER COLUMN sync_revision SET DEFAULT 1;
UPDATE public.transactions SET sync_revision = 1 WHERE sync_revision IS NULL;
ALTER TABLE public.transactions ALTER COLUMN sync_revision SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.transactions'::pg_catalog.regclass
       AND conname = 'transactions_category_origin_check'
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_origin_check
      CHECK (category_origin IN ('eligible', 'unknown', 'user-edited', 'imported', 'rule', 'assistant'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tmf_require_transaction_rpc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The auth.users foreign key cascades after the owning user is removed.
  IF TG_OP = 'DELETE' AND pg_catalog.pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  IF pg_catalog.current_setting('tmf.transaction_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Transaction writes require the current MINARTH app and sync migration'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.sync_revision <> 1 THEN
    RAISE EXCEPTION 'Invalid initial transaction revision' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.sync_revision <> OLD.sync_revision + 1 THEN
    RAISE EXCEPTION 'Invalid transaction revision' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tmf_require_transaction_rpc() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transactions_require_sync_rpc ON public.transactions;
CREATE TRIGGER transactions_require_sync_rpc
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tmf_require_transaction_rpc();

CREATE OR REPLACE FUNCTION public.sync_transactions(p_transactions JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  item JSONB;
  transaction_id TEXT;
  expected_revision INTEGER;
  next_revision INTEGER;
  current_row public.transactions%ROWTYPE;
  row_exists BOOLEAN;
  same_payload BOOLEAN;
  result JSONB := '[]'::JSONB;
BEGIN
  IF caller IS NULL OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_transactions IS NULL OR pg_catalog.jsonb_typeof(p_transactions) <> 'array' THEN
    RAISE EXCEPTION 'Invalid transaction batch' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::TEXT, 0));
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_transactions) AS records(value)
     GROUP BY records.value->>'id'
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate transaction IDs in sync batch' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_transactions)
  LOOP
    IF item ? 'user_id' AND item->>'user_id' IS DISTINCT FROM caller::TEXT THEN
      RAISE EXCEPTION 'Transaction owner changed' USING ERRCODE = '42501';
    END IF;
    IF pg_catalog.jsonb_typeof(item) <> 'object'
       OR NULLIF(item->>'id', '') IS NULL
       OR NULLIF(item->>'title', '') IS NULL
       OR NULLIF(item->>'category', '') IS NULL
       OR item->>'subcategory' IS NULL THEN
      RAISE EXCEPTION 'Invalid transaction in sync batch' USING ERRCODE = '22023';
    END IF;
    transaction_id := item->>'id';
    expected_revision := CASE
      WHEN item->'sync_revision' IS NULL OR item->'sync_revision' = 'null'::JSONB THEN NULL
      ELSE (item->>'sync_revision')::INTEGER
    END;

    SELECT * INTO current_row
      FROM public.transactions
     WHERE user_id = caller AND id = transaction_id
     FOR UPDATE;
    row_exists := FOUND;

    IF row_exists THEN
      IF current_row.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Transaction conflict: transaction was deleted' USING ERRCODE = '40001';
      END IF;
      same_payload := (
        current_row.title = item->>'title'
        AND current_row.amount = (item->>'amount')::NUMERIC
        AND current_row.type = item->>'type'
        AND current_row.category = item->>'category'
        AND current_row.subcategory = item->>'subcategory'
        AND current_row.date = (item->>'date')::DATE
        AND current_row.time IS NOT DISTINCT FROM COALESCE(NULLIF(item->>'time', ''), '00:00')
        AND current_row.location IS NOT DISTINCT FROM NULLIF(item->'location', 'null'::JSONB)
        AND current_row.source IS NOT DISTINCT FROM COALESCE(NULLIF(item->>'source', ''), 'Manual')
        AND current_row.raw_text IS NOT DISTINCT FROM NULLIF(item->>'raw_text', '')
        AND current_row.payee_or_payer IS NOT DISTINCT FROM NULLIF(item->>'payee_or_payer', '')
        AND current_row.payment_method IS NOT DISTINCT FROM NULLIF(item->>'payment_method', '')
        AND current_row.note IS NOT DISTINCT FROM NULLIF(item->>'note', '')
        AND current_row.ref_number IS NOT DISTINCT FROM NULLIF(item->>'ref_number', '')
        AND current_row.kind IS NOT DISTINCT FROM NULLIF(item->>'kind', '')
        AND current_row.account_id IS NOT DISTINCT FROM NULLIF(item->>'account_id', '')
        AND current_row.to_account_id IS NOT DISTINCT FROM NULLIF(item->>'to_account_id', '')
        AND current_row.category_origin IS NOT DISTINCT FROM COALESCE(NULLIF(item->>'category_origin', ''), 'unknown')
      ) IS TRUE;

      IF current_row.sync_revision IS DISTINCT FROM expected_revision THEN
        IF NOT same_payload THEN
          RAISE EXCEPTION 'Transaction conflict: transaction changed on another device' USING ERRCODE = '40001';
        END IF;
        result := result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'id', transaction_id, 'sync_revision', current_row.sync_revision
        ));
        CONTINUE;
      END IF;
      IF same_payload THEN
        result := result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'id', transaction_id, 'sync_revision', current_row.sync_revision
        ));
        CONTINUE;
      END IF;

      next_revision := current_row.sync_revision + 1;
      PERFORM pg_catalog.set_config('tmf.transaction_write', 'allowed', true);
      UPDATE public.transactions SET
        title = item->>'title',
        amount = (item->>'amount')::NUMERIC,
        type = item->>'type',
        category = item->>'category',
        subcategory = item->>'subcategory',
        date = (item->>'date')::DATE,
        time = COALESCE(NULLIF(item->>'time', ''), '00:00'),
        location = NULLIF(item->'location', 'null'::JSONB),
        source = COALESCE(NULLIF(item->>'source', ''), 'Manual'),
        raw_text = NULLIF(item->>'raw_text', ''),
        payee_or_payer = NULLIF(item->>'payee_or_payer', ''),
        payment_method = NULLIF(item->>'payment_method', ''),
        note = NULLIF(item->>'note', ''),
        ref_number = NULLIF(item->>'ref_number', ''),
        kind = NULLIF(item->>'kind', ''),
        account_id = NULLIF(item->>'account_id', ''),
        to_account_id = NULLIF(item->>'to_account_id', ''),
        category_origin = COALESCE(NULLIF(item->>'category_origin', ''), 'unknown'),
        sync_revision = next_revision
      WHERE user_id = caller AND id = transaction_id;
    ELSE
      IF expected_revision IS NOT NULL THEN
        RAISE EXCEPTION 'Transaction conflict: transaction no longer exists' USING ERRCODE = '40001';
      END IF;
      next_revision := 1;
      PERFORM pg_catalog.set_config('tmf.transaction_write', 'allowed', true);
      INSERT INTO public.transactions (
        user_id, id, title, amount, type, category, subcategory, date, time,
        location, source, raw_text, payee_or_payer, payment_method, note,
        ref_number, kind, account_id, to_account_id, sync_revision, category_origin
      ) VALUES (
        caller, transaction_id, item->>'title', (item->>'amount')::NUMERIC,
        item->>'type', item->>'category', item->>'subcategory', (item->>'date')::DATE,
        COALESCE(NULLIF(item->>'time', ''), '00:00'), NULLIF(item->'location', 'null'::JSONB),
        COALESCE(NULLIF(item->>'source', ''), 'Manual'), NULLIF(item->>'raw_text', ''),
        NULLIF(item->>'payee_or_payer', ''), NULLIF(item->>'payment_method', ''),
        NULLIF(item->>'note', ''), NULLIF(item->>'ref_number', ''), NULLIF(item->>'kind', ''),
        NULLIF(item->>'account_id', ''), NULLIF(item->>'to_account_id', ''), next_revision,
        COALESCE(NULLIF(item->>'category_origin', ''), 'unknown')
      );
    END IF;

    result := result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', transaction_id, 'sync_revision', next_revision
    ));
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_transactions(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_transactions(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_transactions(p_transactions JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  item JSONB;
  transaction_id TEXT;
  expected_revision INTEGER;
  current_revision INTEGER;
  current_deleted_at TIMESTAMPTZ;
BEGIN
  IF caller IS NULL OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_transactions IS NULL OR pg_catalog.jsonb_typeof(p_transactions) <> 'array' THEN
    RAISE EXCEPTION 'Invalid transaction deletion batch' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::TEXT, 0));

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_transactions)
  LOOP
    transaction_id := NULLIF(item->>'id', '');
    IF transaction_id IS NULL THEN RAISE EXCEPTION 'Invalid transaction ID' USING ERRCODE = '22023'; END IF;
    expected_revision := CASE
      WHEN item->'sync_revision' IS NULL OR item->'sync_revision' = 'null'::JSONB THEN NULL
      ELSE (item->>'sync_revision')::INTEGER
    END;
    SELECT sync_revision, deleted_at INTO current_revision, current_deleted_at
      FROM public.transactions
     WHERE user_id = caller AND id = transaction_id
     FOR UPDATE;
    IF NOT FOUND OR current_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Transaction conflict: transaction no longer exists or was deleted'
        USING ERRCODE = '40001';
    END IF;
    IF current_revision IS DISTINCT FROM expected_revision THEN
      RAISE EXCEPTION 'Transaction conflict: transaction changed on another device' USING ERRCODE = '40001';
    END IF;
    PERFORM pg_catalog.set_config('tmf.transaction_write', 'allowed', true);
    UPDATE public.transactions
       SET deleted_at = pg_catalog.now(), sync_revision = current_revision + 1
     WHERE user_id = caller AND id = transaction_id;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_transactions(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_transactions(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_own_transactions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.set_config('tmf.transaction_write', 'allowed', true);
  DELETE FROM public.transactions WHERE user_id = caller;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_own_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_own_transactions() TO authenticated;
