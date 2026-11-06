-- Run after supabase_schema.sql, before deploying background notification Add.
-- The authenticated user's transaction and balance change commit together.
CREATE OR REPLACE FUNCTION public.add_notification_payment(payment jsonb, expected_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  inserted_count integer;
  target_account text := payment->>'accountId';
  amount numeric := (payment->>'amount')::numeric;
  direction text := payment->>'type';
  target_balance numeric;
BEGIN
  IF caller IS NULL OR caller IS DISTINCT FROM expected_user OR NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verified account authentication required';
  END IF;
  IF payment->>'id' IS NULL OR payment->>'id' NOT LIKE 'tx_native_%'
     OR amount IS NULL OR amount <= 0 OR amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR direction IS NULL OR direction NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid notification transaction';
  END IF;
  -- Lock the account before inserting: retries and concurrent payments cannot
  -- apply the same balance delta twice. Deleted accounts are never resurrected.
  IF target_account IS NOT NULL THEN
    PERFORM 1 FROM public.financial_accounts
      WHERE user_id = caller AND id = target_account AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment account is unavailable; review in app'; END IF;
  END IF;
  INSERT INTO public.transactions (
    user_id, id, title, amount, type, category, subcategory, date, time,
    location, source, raw_text, payee_or_payer, payment_method, ref_number, kind, account_id
  ) VALUES (
    caller, payment->>'id', payment->>'title', amount, direction,
    payment->>'category', payment->>'subcategory', (payment->>'date')::date,
    payment->>'time', payment->'location', payment->>'source', payment->>'rawText',
    payment->>'payeeOrPayer', payment->>'paymentMethod', payment->>'refNumber',
    payment->>'kind', target_account
  ) ON CONFLICT (user_id, id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 AND payment->>'category' = 'Uncategorized' THEN
    INSERT INTO public.categories (user_id, id, name, type, icon_name, subcategories)
    VALUES (caller, 'cat_uncategorized_' || CASE WHEN direction = 'credit' THEN 'income' ELSE 'expense' END,
      'Uncategorized', CASE WHEN direction = 'credit' THEN 'income' ELSE 'expense' END, 'Tag', '["General"]'::jsonb)
    ON CONFLICT (user_id, id) DO NOTHING;
  END IF;
  IF inserted_count = 1 AND target_account IS NOT NULL THEN
    UPDATE public.financial_accounts SET balance = pg_catalog.round(
      balance + amount * CASE WHEN direction = 'credit' THEN 1 ELSE -1 END
        * CASE WHEN type = 'Credit Card' THEN -1 ELSE 1 END, 2
    ) WHERE user_id = caller AND id = target_account;
  END IF;
  SELECT balance INTO target_balance FROM public.financial_accounts WHERE user_id = caller AND id = target_account;
  RETURN pg_catalog.jsonb_build_object(
    'saved', EXISTS (
      SELECT 1 FROM public.transactions WHERE user_id = caller AND id = payment->>'id' AND deleted_at IS NULL
    ), 'balance', target_balance
  );
END;
$$;
REVOKE ALL ON FUNCTION public.add_notification_payment(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_notification_payment(jsonb, uuid) TO authenticated;
