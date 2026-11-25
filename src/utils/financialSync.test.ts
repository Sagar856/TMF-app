import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('financial batches are atomic, revision checked, owner scoped and recoverable after a lost response', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${owner}'), ('${other}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION public.has_verified_email() RETURNS boolean LANGUAGE sql STABLE
        AS $$ SELECT auth.uid() IS NOT NULL $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
        AS $$ SELECT auth.uid() = '${owner}'::uuid $$;
      CREATE TABLE public.admin_users (user_id uuid);
      CREATE TABLE public.investments (user_id uuid);
      CREATE TABLE public.loans (user_id uuid);
      CREATE TABLE public.user_settings (user_id uuid);
      CREATE TABLE public.user_preferences (user_id uuid);
      CREATE TABLE public.transactions (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        id text NOT NULL, title text NOT NULL, amount numeric NOT NULL CHECK (amount > 0),
        type text NOT NULL, category text NOT NULL, subcategory text NOT NULL,
        date date NOT NULL, time text, location jsonb, source text DEFAULT 'Manual',
        raw_text text, payee_or_payer text, payment_method text, note text,
        ref_number text, kind text, account_id text, to_account_id text,
        deleted_at timestamptz, PRIMARY KEY (user_id, id)
      );
      CREATE TABLE public.financial_accounts (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, id text NOT NULL,
        name text NOT NULL, bank_name text NOT NULL, type text NOT NULL, account_number_last4 text NOT NULL,
        balance numeric NOT NULL, credit_limit numeric, approx_monthly_bill numeric, due_date text,
        card_holder_name text, card_network text, card_color_theme text, is_default boolean,
        deleted_at timestamptz, PRIMARY KEY (user_id, id)
      );
      CREATE TABLE public.categories (
        user_id uuid NOT NULL, id text NOT NULL, name text, type text, icon_name text,
        subcategories jsonb, PRIMARY KEY (user_id, id)
      );
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
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions, public.financial_accounts, public.categories TO authenticated;
    `);
    for (const script of ['supabase_transaction_sync.sql', 'supabase_background_payments.sql', 'supabase_financial_sync.sql']) {
      await db.exec(readFileSync(new URL(`../../${script}`, import.meta.url), 'utf8'));
    }
    // Applying the migration again must preserve installed guards and receipts.
    await db.exec(readFileSync(new URL('../../supabase_financial_sync.sql', import.meta.url), 'utf8'));
    const schema = readFileSync(new URL('../../supabase_schema.sql', import.meta.url), 'utf8');
    await db.exec(schema.slice(schema.indexOf('CREATE OR REPLACE FUNCTION public.delete_own_account()'), schema.indexOf('-- 1. Transactions Table')));
    const admin = readFileSync(new URL('../../supabase_admin.sql', import.meta.url), 'utf8');
    await db.exec(admin.slice(admin.indexOf('CREATE OR REPLACE FUNCTION public.admin_delete_user_data'), admin.indexOf('-- Permanently delete a user')));
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    const bank = { id: 'bank', name: 'Bank', bank_name: 'Bank', type: 'Bank', account_number_last4: '', balance: 100 };
    const card = { ...bank, id: 'card', name: 'Card', type: 'Credit Card', balance: 50 };
    const cash = { ...bank, id: 'cash', name: 'Cash', type: 'Cash', balance: 10 };
    const tx = { id: 'tx', title: 'Test', amount: 20, type: 'debit', category: 'Food', subcategory: 'General',
      date: '2026-01-01', account_id: 'bank', kind: 'expense' };
    const call = (accounts: object[], transactions: object[], deletions: object[] = [], id?: string, expected = owner, epoch = 1) => {
      const payload = JSON.stringify([accounts, transactions, deletions]);
      return db.query<{ result: { accounts: { id: string; sync_revision: number }[] } }>(
        'SELECT public.sync_financial_state($1::jsonb, $2::jsonb, $3::jsonb, $4, $5::uuid, $6::bigint) AS result',
        [JSON.stringify(accounts), JSON.stringify(transactions), JSON.stringify(deletions), id || createHash('sha256').update(payload).digest('hex'), expected, epoch]);
    };
    const balances = async () => (await db.query<{ id: string; balance: number; sync_revision: number }>(
      'SELECT id, balance::float8 AS balance, sync_revision FROM public.financial_accounts ORDER BY id')).rows;
    const snapshot = async () => (await db.query<{ state: {
      epoch: number; accounts: { id: string }[]; transactions: { id: string }[];
      deleted_accounts: string[]; deleted_transactions: string[];
    } }>('SELECT public.fetch_financial_state($1::uuid) AS state', [owner])).rows[0].state;
    const initial = [{ ...bank, balance: 80 }, card, cash];
    const committed = await call(initial, [tx]);
    assert.deepEqual((await call(initial, [tx])).rows, committed.rows);
    assert.deepEqual(await balances(), [
      { id: 'bank', balance: 80, sync_revision: 1 }, { id: 'card', balance: 50, sync_revision: 1 }, { id: 'cash', balance: 10, sync_revision: 1 },
    ]);
    const current = initial.map(account => ({ ...account, sync_revision: 1 }));
    await assert.rejects(call(current.map(a => ({ ...a, balance: a.balance - 5 })), [{ ...tx, id: 'invalid', amount: -1 }]), { code: '23514' });
    assert.equal((await balances())[0].balance, 80);
    assert.equal((await balances())[0].sync_revision, 1);
    await assert.rejects(call(current, [{ ...tx, id: 'owner-swap' }], [], undefined, other), { code: '42501' });
    await assert.rejects(db.exec("UPDATE public.financial_accounts SET balance = 0"), { code: '42501' });
    await assert.rejects(db.exec('UPDATE public.financial_sync_epochs SET epoch = 99'), { code: '42501' });
    await assert.rejects(db.exec('DELETE FROM public.financial_sync_receipts'), { code: '42501' });
    await assert.rejects(db.query('SELECT public.sync_transactions($1::jsonb)', [JSON.stringify([{ ...tx, id: 'unpaired' }])]), { code: '42501' });
    // A real, background RPC changes the balance and revision under the same owner lock.
    const payment = { id: 'tx_native_payment', title: 'Synthetic', amount: 5, type: 'debit', category: 'Food',
      subcategory: 'General', date: '2026-01-01', accountId: 'bank' };
    await db.query('SELECT public.add_notification_payment($1::jsonb,$2::uuid)', [JSON.stringify(payment), owner]);
    // Equal balances do not prove that a new operation is a retry.
    const stale = current.map(a => a.id === 'bank' ? { ...a, balance: 75 } : a);
    await assert.rejects(call(stale, [{ ...tx, id: 'different-payment', amount: 5 }]), { code: '40001' });
    assert.equal((await db.query("SELECT id FROM public.transactions WHERE id = 'different-payment'")).rows.length, 0);
    // Retrying the original operation returns its receipt without overwriting newer balances.
    assert.deepEqual((await call(initial, [tx])).rows, committed.rows);
    assert.equal((await balances())[0].balance, 75);
    const updated = current.map(a => a.id === 'bank' ? { ...a, balance: 75, sync_revision: 2 } : a);
    const withdrawal = { ...tx, id: 'cash-out', amount: 10, kind: 'transfer', subcategory: 'Cash Withdrawal', to_account_id: 'cash' };
    const withdrawn = updated.map(a => a.id === 'bank' ? { ...a, balance: 65 } : a.id === 'cash' ? { ...a, balance: 20 } : a);
    await call(withdrawn, [withdrawal]);
    const afterWithdrawal = withdrawn.map(a => ({ ...a, sync_revision: a.id === 'bank' ? 3 : a.id === 'cash' ? 2 : 1 }));
    // A stale deletion rolls back its account projection too.
    const retained = { ...tx, id: 'retained-new', amount: 5 };
    const reverted = afterWithdrawal.map(a => a.id === 'bank' ? { ...a, balance: 70 } : a.id === 'cash' ? { ...a, balance: 10 } : a);
    await assert.rejects(call(reverted, [retained], [{ id: 'cash-out', sync_revision: 9 }]), { code: '40001' });
    assert.equal((await balances())[0].balance, 65);
    assert.equal((await db.query("SELECT id FROM public.transactions WHERE id = 'retained-new'")).rows.length, 0);
    const deleted = await call(reverted, [retained], [{ id: 'cash-out', sync_revision: 1 }]);
    assert.deepEqual((await call(reverted, [retained], [{ id: 'cash-out', sync_revision: 1 }])).rows, deleted.rows);
    assert.equal((await balances())[0].balance, 70);
    assert.equal((await db.query("SELECT id FROM public.transactions WHERE id = 'retained-new' AND deleted_at IS NULL")).rows.length, 1);
    await assert.rejects(call([], []), { code: '40001' });
    // A metadata-only category update cannot alter balances.
    await db.query('SELECT public.sync_transactions($1::jsonb)', [JSON.stringify([{ ...tx, sync_revision: 1, category: 'Shopping' }])]);
    assert.equal((await balances())[0].balance, 70);
    const deleteCard = (revision: number) => db.query(
      'SELECT public.delete_financial_accounts($1::jsonb, $2::uuid, 1)', [JSON.stringify([{ id: 'card', sync_revision: revision }]), owner]);
    await assert.rejects(deleteCard(99), { code: '40001' });
    await deleteCard(1);
    await deleteCard(1);
    const state = await snapshot();
    assert.equal(state.epoch, 1);
    assert.deepEqual(state.accounts.map(account => account.id).sort(), ['bank', 'cash']);
    assert.deepEqual(state.transactions.map(transaction => transaction.id).sort(), ['retained-new', 'tx', 'tx_native_payment']);
    assert.deepEqual(state.deleted_accounts, ['card']);
    assert.deepEqual(state.deleted_transactions, ['cash-out']);
    // Owner B cannot read receipts or accounts belonging to A.
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.deepEqual(await balances(), []);
    assert.equal((await db.query('SELECT * FROM public.financial_sync_receipts')).rows.length, 0);
    await call([bank], [], [], undefined, other);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await db.query('SELECT public.admin_delete_user_data($1::uuid)', [other]);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [other]);
    await assert.rejects(call([bank], [], [], undefined, other), { code: '40001' });
    await call([bank], [], [], undefined, other, 2);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await assert.rejects(db.query('SELECT public.reset_financial_state($1::uuid)', [other]), { code: '42501' });
    await db.query('SELECT public.reset_financial_state($1::uuid)', [owner]);
    await assert.rejects(call([{ ...bank, id: 'never-synced-new-account' }], []), { code: '40001' });
    assert.equal((await snapshot()).epoch, 2);
    await call([{ ...bank, id: 'post-reset' }], [], [], undefined, owner, 2);
    await db.query('SELECT public.reset_financial_state($1::uuid)', [owner]);
    assert.deepEqual(await balances(), []);
    assert.equal((await db.query('SELECT * FROM public.transactions')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.financial_sync_receipts')).rows.length, 0);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT * FROM public.financial_accounts')).rows.length, 1);
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [other]);
    await db.exec('SELECT public.delete_own_account()');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT * FROM public.financial_accounts')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.financial_sync_receipts')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.financial_sync_epochs WHERE user_id = $1', [other])).rows.length, 0);
  } finally {
    await db.close();
  }
});
