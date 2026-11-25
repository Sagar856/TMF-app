-- Apply after the schema, transaction-sync and background-payment scripts.
-- Deploy only with the matching client after validating the rollout.
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS sync_revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.financial_sync_epochs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  epoch BIGINT NOT NULL DEFAULT 1 CHECK (epoch > 0)
);
ALTER TABLE public.financial_sync_epochs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_financial_sync_epoch ON public.financial_sync_epochs;
CREATE POLICY own_financial_sync_epoch ON public.financial_sync_epochs TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.financial_sync_epochs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_sync_epochs TO authenticated;
DO $$
BEGIN
  PERFORM pg_catalog.set_config('tmf.financial_write', 'allowed', true);
  INSERT INTO public.financial_sync_epochs (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;
END;
$$;

CREATE TABLE IF NOT EXISTS public.financial_sync_receipts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  payload_hash BYTEA NOT NULL,
  result JSONB NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);
ALTER TABLE public.financial_sync_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_financial_sync_receipts ON public.financial_sync_receipts;
CREATE POLICY own_financial_sync_receipts ON public.financial_sync_receipts TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.financial_sync_receipts FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.financial_sync_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.tmf_guard_financial_sync_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN RETURN OLD; END IF;
  IF pg_catalog.current_setting('tmf.financial_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Financial sync metadata requires the current RPC' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tmf_guard_financial_sync_metadata() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS financial_epochs_require_rpc ON public.financial_sync_epochs;
CREATE TRIGGER financial_epochs_require_rpc BEFORE INSERT OR UPDATE OR DELETE
  ON public.financial_sync_epochs FOR EACH ROW EXECUTE FUNCTION public.tmf_guard_financial_sync_metadata();
DROP TRIGGER IF EXISTS financial_receipts_require_rpc ON public.financial_sync_receipts;
CREATE TRIGGER financial_receipts_require_rpc BEFORE INSERT OR UPDATE OR DELETE
  ON public.financial_sync_receipts FOR EACH ROW EXECUTE FUNCTION public.tmf_guard_financial_sync_metadata();

CREATE OR REPLACE FUNCTION public.tmf_guard_account_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  IF pg_catalog.current_setting('tmf.account_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Account writes require the current MINARTH financial sync protocol' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.sync_revision := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.sync_revision + 1 END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tmf_guard_account_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS financial_accounts_require_rpc ON public.financial_accounts;
CREATE TRIGGER financial_accounts_require_rpc BEFORE INSERT OR UPDATE OR DELETE
  ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.tmf_guard_account_write();

CREATE OR REPLACE FUNCTION public.tmf_guard_financial_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN RETURN OLD; END IF;
  IF pg_catalog.current_setting('tmf.financial_write', true) = 'allowed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  -- Category-only AI writes remain supported, but cannot move money.
  IF TG_OP = 'UPDATE' AND
    ROW(NEW.amount, NEW.type, NEW.account_id, NEW.payment_method, NEW.to_account_id, NEW.deleted_at,
        COALESCE(NEW.kind = 'transfer' AND NEW.type = 'debit' AND pg_catalog.lower(pg_catalog.btrim(NEW.subcategory)) = 'cash withdrawal', false))
    IS NOT DISTINCT FROM
    ROW(OLD.amount, OLD.type, OLD.account_id, OLD.payment_method, OLD.to_account_id, OLD.deleted_at,
        COALESCE(OLD.kind = 'transfer' AND OLD.type = 'debit' AND pg_catalog.lower(pg_catalog.btrim(OLD.subcategory)) = 'cash withdrawal', false))
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Transaction and balance changes require atomic financial sync' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.tmf_guard_financial_transaction() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS transactions_require_financial_batch ON public.transactions;
CREATE TRIGGER transactions_require_financial_batch BEFORE INSERT OR UPDATE OR DELETE
  ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.tmf_guard_financial_transaction();

CREATE OR REPLACE FUNCTION public.sync_financial_state(p_accounts JSONB, p_transactions JSONB, p_deletions JSONB, p_operation_id TEXT, p_expected_user UUID, p_epoch BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  item JSONB;
  incoming public.financial_accounts%ROWTYPE;
  existing public.financial_accounts%ROWTYPE;
  account_results JSONB := '[]'::JSONB;
  transaction_results JSONB;
  same_payload BOOLEAN;
  payload_hash BYTEA;
  receipt public.financial_sync_receipts%ROWTYPE;
  result JSONB;
BEGIN
  IF caller IS NULL OR caller IS DISTINCT FROM p_expected_user OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.jsonb_typeof(p_accounts) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_transactions) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_deletions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid financial sync batch' USING ERRCODE = '22023';
  END IF;
  -- Serialize all of this owner's foreground/background/reset operations,
  -- including creation of rows that do not yet exist.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::TEXT, 0));
  IF p_epoch IS DISTINCT FROM (SELECT e.epoch FROM public.financial_sync_epochs e WHERE e.user_id = caller) THEN
    RAISE EXCEPTION 'Financial records were reset; reload before syncing' USING ERRCODE = '40001';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid financial operation ID' USING ERRCODE = '22023';
  END IF;
  payload_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_accounts, p_transactions, p_deletions)::TEXT, 'UTF8'));
  SELECT * INTO receipt FROM public.financial_sync_receipts WHERE user_id = caller AND operation_id = p_operation_id;
  IF FOUND THEN
    IF receipt.payload_hash IS DISTINCT FROM payload_hash THEN
      RAISE EXCEPTION 'Financial operation ID reused with different data' USING ERRCODE = '22023';
    END IF;
    RETURN receipt.result;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_accounts) AS a(value)
    GROUP BY a.value->>'id' HAVING pg_catalog.count(*) > 1)
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_transactions) AS t(value)
      JOIN pg_catalog.jsonb_array_elements(p_deletions) AS d(value) ON t.value->>'id' = d.value->>'id') THEN
    RAISE EXCEPTION 'Duplicate financial IDs' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_accounts a
    WHERE a.user_id = caller AND a.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_accounts) AS r(value) WHERE r.value->>'id' = a.id)) THEN
    RAISE EXCEPTION 'Account conflict: reload the financial records before syncing' USING ERRCODE = '40001';
  END IF;
  PERFORM pg_catalog.set_config('tmf.account_write', 'allowed', true);
  PERFORM pg_catalog.set_config('tmf.financial_write', 'allowed', true);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_accounts)
  LOOP
    incoming := pg_catalog.jsonb_populate_record(NULL::public.financial_accounts, item);
    IF NULLIF(incoming.id, '') IS NULL OR NULLIF(incoming.name, '') IS NULL OR incoming.type IS NULL
       OR incoming.balance IS NULL OR incoming.balance::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Invalid financial account' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO existing FROM public.financial_accounts WHERE user_id = caller AND id = incoming.id FOR UPDATE;
    IF FOUND THEN
      IF existing.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Account conflict: account was deleted' USING ERRCODE = '40001';
      END IF;
      same_payload := ROW(existing.name, existing.bank_name, existing.type, existing.account_number_last4,
        existing.balance, existing.credit_limit, existing.approx_monthly_bill, existing.due_date,
        existing.card_holder_name, existing.card_network, existing.card_color_theme, existing.is_default)
        IS NOT DISTINCT FROM ROW(incoming.name, incoming.bank_name, incoming.type, incoming.account_number_last4,
        incoming.balance, incoming.credit_limit, incoming.approx_monthly_bill, incoming.due_date,
        incoming.card_holder_name, incoming.card_network, incoming.card_color_theme, incoming.is_default);
      IF existing.sync_revision IS DISTINCT FROM incoming.sync_revision THEN
        RAISE EXCEPTION 'Account conflict: account changed on another device' USING ERRCODE = '40001';
      END IF;
      IF NOT same_payload THEN
        UPDATE public.financial_accounts SET
          name = incoming.name, bank_name = incoming.bank_name, type = incoming.type,
          account_number_last4 = incoming.account_number_last4, balance = incoming.balance,
          credit_limit = incoming.credit_limit, approx_monthly_bill = incoming.approx_monthly_bill,
          due_date = incoming.due_date, card_holder_name = incoming.card_holder_name,
          card_network = incoming.card_network, card_color_theme = incoming.card_color_theme,
          is_default = incoming.is_default
        WHERE user_id = caller AND id = incoming.id
        RETURNING * INTO existing;
      END IF;
    ELSE
      IF incoming.sync_revision IS NOT NULL THEN
        RAISE EXCEPTION 'Account conflict: account no longer exists' USING ERRCODE = '40001';
      END IF;
      INSERT INTO public.financial_accounts (user_id, id, name, bank_name, type, account_number_last4,
        balance, credit_limit, approx_monthly_bill, due_date, card_holder_name, card_network, card_color_theme, is_default)
      VALUES (caller, incoming.id, incoming.name, incoming.bank_name, incoming.type, incoming.account_number_last4,
        incoming.balance, incoming.credit_limit, incoming.approx_monthly_bill, incoming.due_date,
        incoming.card_holder_name, incoming.card_network, incoming.card_color_theme, incoming.is_default)
      RETURNING * INTO existing;
    END IF;
    account_results := account_results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', existing.id, 'sync_revision', existing.sync_revision));
  END LOOP;
  transaction_results := public.sync_transactions(p_transactions);
  IF pg_catalog.jsonb_array_length(p_deletions) > 0 THEN
    PERFORM public.delete_transactions(p_deletions);
  END IF;
  result := pg_catalog.jsonb_build_object('accounts', account_results, 'transactions', transaction_results);
  INSERT INTO public.financial_sync_receipts (user_id, operation_id, payload_hash, result)
    VALUES (caller, p_operation_id, payload_hash, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_financial_state(JSONB, JSONB, JSONB, TEXT, UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_financial_state(JSONB, JSONB, JSONB, TEXT, UUID, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_financial_accounts(p_ids JSONB, p_expected_user UUID, p_epoch BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  item JSONB;
  existing public.financial_accounts%ROWTYPE;
BEGIN
  IF caller IS NULL OR caller IS DISTINCT FROM p_expected_user OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.jsonb_typeof(p_ids) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid account deletion batch' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::TEXT, 0));
  IF p_epoch IS DISTINCT FROM (SELECT e.epoch FROM public.financial_sync_epochs e WHERE e.user_id = caller) THEN
    RAISE EXCEPTION 'Financial records were reset; reload before deleting' USING ERRCODE = '40001';
  END IF;
  PERFORM pg_catalog.set_config('tmf.account_write', 'allowed', true);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_ids)
  LOOP
    SELECT * INTO existing FROM public.financial_accounts WHERE user_id = caller AND id = item->>'id' FOR UPDATE;
    IF NOT FOUND OR (existing.deleted_at IS NULL AND existing.sync_revision IS DISTINCT FROM (item->>'sync_revision')::INTEGER) THEN
      RAISE EXCEPTION 'Account changed; reload before deleting' USING ERRCODE = '40001';
    END IF;
    IF existing.deleted_at IS NULL THEN
      UPDATE public.financial_accounts SET deleted_at = pg_catalog.now() WHERE user_id = caller AND id = existing.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_financial_accounts(JSONB, UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_financial_accounts(JSONB, UUID, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_financial_state(p_expected_user UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF caller IS NULL OR caller IS DISTINCT FROM p_expected_user OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.set_config('tmf.financial_write', 'allowed', true);
  INSERT INTO public.financial_sync_epochs (user_id) VALUES (caller) ON CONFLICT DO NOTHING;
  RETURN (
    SELECT pg_catalog.jsonb_build_object(
      'epoch', (SELECT e.epoch FROM public.financial_sync_epochs e WHERE e.user_id = caller),
      'transactions', COALESCE((SELECT pg_catalog.jsonb_agg(t ORDER BY t.date DESC) FROM public.transactions t WHERE t.user_id = caller AND t.deleted_at IS NULL), '[]'::JSONB),
      'accounts', COALESCE((SELECT pg_catalog.jsonb_agg(a) FROM public.financial_accounts a WHERE a.user_id = caller AND a.deleted_at IS NULL), '[]'::JSONB),
      'deleted_transactions', COALESCE((SELECT pg_catalog.jsonb_agg(t.id) FROM public.transactions t WHERE t.user_id = caller AND t.deleted_at IS NOT NULL), '[]'::JSONB),
      'deleted_accounts', COALESCE((SELECT pg_catalog.jsonb_agg(a.id) FROM public.financial_accounts a WHERE a.user_id = caller AND a.deleted_at IS NOT NULL), '[]'::JSONB)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_financial_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_financial_state(UUID) TO authenticated;

-- A reset removes both sides of the ledger in the same commit, not in two HTTP requests.
CREATE OR REPLACE FUNCTION public.reset_own_transactions()
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::TEXT, 0));
  PERFORM pg_catalog.set_config('tmf.transaction_write', 'allowed', true);
  PERFORM pg_catalog.set_config('tmf.financial_write', 'allowed', true);
  PERFORM pg_catalog.set_config('tmf.account_write', 'allowed', true);
  DELETE FROM public.transactions WHERE user_id = caller;
  DELETE FROM public.financial_accounts WHERE user_id = caller;
  DELETE FROM public.financial_sync_receipts WHERE user_id = caller;
  INSERT INTO public.financial_sync_epochs (user_id, epoch) VALUES (caller, 2)
    ON CONFLICT (user_id) DO UPDATE SET epoch = public.financial_sync_epochs.epoch + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_financial_state(p_expected_user UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_expected_user THEN
    RAISE EXCEPTION 'Account changed before data reset' USING ERRCODE = '42501';
  END IF;
  PERFORM public.reset_own_transactions();
END;
$$;
REVOKE ALL ON FUNCTION public.reset_financial_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_financial_state(UUID) TO authenticated;
