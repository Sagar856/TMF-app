import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('transaction guard permits auth account cascades but still rejects direct deletion', async () => {
  const db = new PGlite();
  const firstUser = '00000000-0000-0000-0000-000000000001';
  const secondUser = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${firstUser}'), ('${secondUser}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION public.has_verified_email() RETURNS boolean LANGUAGE sql STABLE
        SECURITY DEFINER SET search_path = ''
        AS $$ SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()) $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
        AS $$ SELECT auth.uid() = '${firstUser}'::uuid $$;
      CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY);
      CREATE TABLE public.categories (user_id uuid);
      CREATE TABLE public.financial_accounts (user_id uuid);
      CREATE TABLE public.investments (user_id uuid);
      CREATE TABLE public.loans (user_id uuid);
      CREATE TABLE public.user_settings (user_id uuid);
      CREATE TABLE public.user_preferences (user_id uuid);
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE public.transactions (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        id text NOT NULL, title text NOT NULL, amount numeric NOT NULL,
        type text NOT NULL, category text NOT NULL, subcategory text NOT NULL,
        date date NOT NULL, time text, location jsonb, source text DEFAULT 'Manual',
        raw_text text, payee_or_payer text, payment_method text, note text,
        ref_number text, kind text, account_id text, to_account_id text,
        deleted_at timestamptz, PRIMARY KEY (user_id, id)
      );
      ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_transactions ON public.transactions TO authenticated
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
    `);
    const schema = readFileSync(new URL('../../supabase_schema.sql', import.meta.url), 'utf8');
    const deleteAccount = schema.slice(
      schema.indexOf('CREATE OR REPLACE FUNCTION public.delete_own_account()'),
      schema.indexOf('-- 1. Transactions Table'),
    );
    assert.match(deleteAccount, /DELETE FROM auth\.users WHERE id = caller/);
    await db.exec(deleteAccount);
    await db.exec(readFileSync(new URL('../../supabase_transaction_sync.sql', import.meta.url), 'utf8'));
    const adminSql = readFileSync(new URL('../../supabase_admin.sql', import.meta.url), 'utf8');
    await db.exec(adminSql.slice(
      adminSql.indexOf('CREATE OR REPLACE FUNCTION public.admin_delete_user_data'),
      adminSql.indexOf('-- Permanently delete a user'),
    ));

    const record = {
      id: 'synthetic', title: 'Example', amount: 1, type: 'debit',
      category: 'Food', subcategory: '', date: '2026-01-01',
    };
    await db.exec('SET ROLE authenticated');
    for (const user of [firstUser, secondUser]) {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.query('SELECT public.sync_transactions($1::jsonb)', [JSON.stringify([record])]);
    }
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [firstUser]);
    await assert.rejects(db.exec("DELETE FROM public.transactions WHERE id = 'synthetic'"), { code: '42501' });
    const deletedRecord = { ...record, id: 'to-delete' };
    await db.query('SELECT public.sync_transactions($1::jsonb)', [JSON.stringify([deletedRecord])]);
    const deletion = JSON.stringify([{ id: 'to-delete', sync_revision: 1 }]);
    await db.query('SELECT public.delete_transactions($1::jsonb)', [deletion]);
    await assert.rejects(db.query('SELECT public.delete_transactions($1::jsonb)', [deletion]), { code: '40001' });
    await assert.rejects(db.query('SELECT public.delete_transactions($1::jsonb)', [JSON.stringify([{ id: 'missing', sync_revision: 1 }])]), { code: '40001' });
    const batch = JSON.stringify([{ id: 'synthetic', sync_revision: 1 }, { id: 'to-delete', sync_revision: 1 }]);
    await assert.rejects(db.query('SELECT public.delete_transactions($1::jsonb)', [batch]), { code: '40001' });
    assert.deepEqual((await db.query("SELECT deleted_at FROM public.transactions WHERE id = 'synthetic'")).rows, [{ deleted_at: null }]);
    await db.exec(`
      CREATE TEMP TABLE nested_delete_test (id text);
      CREATE FUNCTION pg_temp.nested_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        DELETE FROM public.transactions WHERE id = NEW.id;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER nested_delete BEFORE INSERT ON nested_delete_test
        FOR EACH ROW EXECUTE FUNCTION pg_temp.nested_delete();
    `);
    await assert.rejects(db.exec("INSERT INTO nested_delete_test VALUES ('synthetic')"), { code: '42501' });
    await db.query('SELECT public.admin_delete_user_data($1::uuid)', [secondUser]);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [secondUser]);
    await assert.rejects(db.query('SELECT public.admin_delete_user_data($1::uuid)', [firstUser]), { code: '42501' });
    await db.query('SELECT public.sync_transactions($1::jsonb)', [JSON.stringify([record])]);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [firstUser]);
    await db.exec('SELECT public.delete_own_account()');
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT user_id FROM public.transactions')).rows, [{ user_id: secondUser }]);
    assert.deepEqual((await db.query('SELECT id FROM auth.users')).rows, [{ id: secondUser }]);

    await db.query('DELETE FROM auth.users WHERE id = $1', [secondUser]);
    assert.equal((await db.query('SELECT * FROM public.transactions')).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('background payment RPC commits balances and transactions together and retries once', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${owner}'), ('${other}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION public.has_verified_email() RETURNS boolean LANGUAGE sql STABLE
        AS $$ SELECT auth.uid() IS NOT NULL $$;
      CREATE TABLE public.transactions (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        id text NOT NULL, title text NOT NULL, amount numeric NOT NULL,
        type text NOT NULL, category text NOT NULL, subcategory text NOT NULL,
        date date NOT NULL, time text, location jsonb, source text DEFAULT 'Manual',
        raw_text text, payee_or_payer text, payment_method text, note text,
        ref_number text, kind text, account_id text, to_account_id text,
        deleted_at timestamptz, PRIMARY KEY (user_id, id)
      );
      CREATE TABLE public.financial_accounts (
        user_id uuid NOT NULL, id text NOT NULL, name text NOT NULL, bank_name text NOT NULL,
        type text NOT NULL, account_number_last4 text NOT NULL, balance numeric NOT NULL,
        deleted_at timestamptz, PRIMARY KEY (user_id, id)
      );
      CREATE TABLE public.categories (
        user_id uuid NOT NULL, id text NOT NULL, name text, type text, icon_name text,
        subcategories jsonb, PRIMARY KEY (user_id, id)
      );
      INSERT INTO public.financial_accounts VALUES
        ('${owner}', 'bank', 'Bank', 'Bank', 'Bank', '', 100, NULL),
        ('${owner}', 'card', 'Card', 'Bank', 'Credit Card', '', 50, NULL),
        ('${owner}', 'cash', 'Cash', 'Cash', 'Cash', '', 10, NULL),
        ('${other}', 'other-bank', 'Other', 'Bank', 'Bank', '', 500, NULL);
      ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_transactions ON public.transactions TO authenticated
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY own_accounts ON public.financial_accounts TO authenticated
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY own_categories ON public.categories TO authenticated
        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
      GRANT SELECT, INSERT, UPDATE ON public.financial_accounts TO authenticated;
      GRANT SELECT, INSERT ON public.categories TO authenticated;
      CREATE FUNCTION public.reject_negative_test_balance() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.balance < 0 THEN RAISE EXCEPTION 'synthetic account failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_negative_test_balance BEFORE UPDATE ON public.financial_accounts
        FOR EACH ROW EXECUTE FUNCTION public.reject_negative_test_balance();
    `);
    await db.exec(readFileSync(new URL('../../supabase_transaction_sync.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../supabase_background_payments.sql', import.meta.url), 'utf8'));
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    const payment = {
      id: 'tx_native_bank', title: 'Synthetic payment', amount: 20, type: 'debit',
      category: 'Food', subcategory: 'General', date: '2026-01-01', time: '12:00',
      accountId: 'bank', source: 'UPI',
    };
    const add = (value: object, expected = owner) =>
      db.query('SELECT public.add_notification_payment($1::jsonb, $2::uuid)', [JSON.stringify(value), expected]);
    const balance = async (id: string) => {
      const result = await db.query<{ balance: string }>('SELECT balance FROM public.financial_accounts WHERE id = $1', [id]);
      return Number(result.rows[0].balance);
    };

    await add(payment);
    await add(payment);
    assert.equal(await balance('bank'), 80);
    await add({ ...payment, id: 'tx_native_card', accountId: 'card' });
    assert.equal(await balance('card'), 70);
    await add({ ...payment, id: 'tx_native_cash', amount: 30, kind: 'transfer', subcategory: 'Cash Withdrawal', toAccountId: 'cash' });
    await add({ ...payment, id: 'tx_native_cash', amount: 30, kind: 'transfer', subcategory: 'Cash Withdrawal', toAccountId: 'cash' });
    assert.equal(await balance('bank'), 50);
    assert.equal(await balance('cash'), 40);
    await assert.rejects(add({ ...payment, id: 'tx_native_failed', amount: 100 }), /synthetic account failure/);
    assert.equal(await balance('bank'), 50);
    assert.equal((await db.query("SELECT id FROM public.transactions WHERE id = 'tx_native_failed'")).rows.length, 0);
    await assert.rejects(add({ ...payment, id: 'tx_native_other', accountId: 'other-bank' }), /account is unavailable/);
    await assert.rejects(add({ ...payment, id: 'tx_native_wrong_owner' }, other), /authentication required/);
  } finally {
    await db.close();
  }
});
