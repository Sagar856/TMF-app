import { createClient, SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Transaction, Category, FinancialAccount, InvestmentRecord, LoanRecord } from '../types/finance';

let supabaseInstance: SupabaseClient | null = null;
let clientInitAttempted = false;

// This is a shared, single-project multi-tenant backend: every user of this
// app talks to the SAME Supabase project (URL + anon key baked in at build
// time via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example and
// the GitHub Actions build workflows). Users never see or configure these
// credentials themselves; per-user data isolation is enforced entirely by
// Postgres Row Level Security (see supabase_schema.sql) keyed off each
// authenticated user's real Supabase Auth session, not by which URL/key they
// typed in. There is intentionally no per-user override anymore.
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;
  if (clientInitAttempted) return null; // avoid retrying createClient on every call when misconfigured

  const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
  const supabaseUrl = metaEnv.VITE_SUPABASE_URL;
  const supabaseKey = metaEnv.VITE_SUPABASE_ANON_KEY;

  clientInitAttempted = true;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Cloud sync is disabled: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY were not set at build time.');
    return null;
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }

  return supabaseInstance;
}

/** Whether this build has a shared backend configured at all (env vars present). */
export function isCloudBackendConfigured(): boolean {
  return Boolean(getSupabaseClient());
}

// Single source of truth for the redirect URL used by both sign-up email
// confirmation and password-reset emails. Supabase only allows redirecting
// to URLs explicitly whitelisted in Authentication -> URL Configuration ->
// Redirect URLs — if this exact URL (or a wildcard pattern matching it,
// e.g. "https://you.example.com/**") isn't in that list, clicking the link
// in the email shows Supabase's own "requested path is invalid" error page.
// This cannot be fixed from app code; it's exposed here so the UI can show
// the user the exact value to paste into their Supabase dashboard.
export function getAuthRedirectUrl(): string {
  const baseUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.BASE_URL || '/';
  return `${window.location.origin}${baseUrl}`;
}

/** Lightweight reachability check used for the sync-status indicator. */
export async function checkBackendReachable(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('transactions').select('count', { count: 'exact', head: true });
    // PGRST116 ("no rows") or any RLS-related empty result still means the
    // backend itself is reachable and responding.
    return !error || error.code === 'PGRST116';
  } catch {
    return false;
  }
}

// ===============================================
// SUPABASE AUTHENTICATION HELPERS
// ===============================================

export async function signUpUser(email: string, pass: string, fullName: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured yet. Please enter your Supabase URL & Key in Settings.");

  const emailRedirectTo = getAuthRedirectUrl();

  const { data, error } = await client.auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo,
    },
  });

  if (error) {
    if (error.message?.toLowerCase().includes('requested path is invalid')) {
      throw new Error(
        `Supabase rejected the confirmation redirect URL "${emailRedirectTo}". Add this exact URL to your ` +
        `Supabase project's Authentication → URL Configuration → Redirect URLs list, then try again.`
      );
    }
    throw error;
  }
  return data;
}

export async function signInUser(email: string, pass: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured yet. Please enter your Supabase URL & Key in Settings.");

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error) throw error;
  return data;
}

export async function signOutUser() {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function getCurrentUserSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

// Sends a real password-reset email via Supabase Auth. The link redirects
// back to the app; Supabase appends a recovery token to the URL which
// triggers a PASSWORD_RECOVERY auth event (see subscribeToAuthChanges below).
//
// IMPORTANT: Supabase only allows redirecting to URLs that are explicitly
// whitelisted in your project's Authentication -> URL Configuration ->
// Redirect URLs list. If that list doesn't contain this exact origin (e.g.
// your Netlify/GitHub Pages URL, or http://localhost:3000 while developing),
// Supabase's Auth server rejects the request with "requested path is
// invalid" — this is a Supabase project setting, not something fixable from
// the app itself. See the README for the exact URL to add.
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured yet. Please enter your Supabase URL & Key in Settings.');

  const redirectTo = getAuthRedirectUrl();

  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    if (error.message?.toLowerCase().includes('requested path is invalid')) {
      throw new Error(
        `Supabase rejected the redirect URL "${redirectTo}". Add this exact URL to your Supabase project's ` +
        `Authentication → URL Configuration → Redirect URLs list, then try again.`
      );
    }
    throw error;
  }
}

// Updates the password for the currently authenticated session. Must be
// called after a PASSWORD_RECOVERY event has established a recovery session.
export async function updatePassword(newPassword: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured yet.');

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Subscribes to Supabase auth state changes (e.g. to detect password-recovery
// redirects). Returns an unsubscribe function.
export function subscribeToAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

// ===============================================
// DATA SYNC SERVICES FOR REACT COMPONENTS
// ===============================================

// Every sync function used to swallow errors silently (`catch { return false }`
// with no logging), which is exactly why "adding a record doesn't show up in
// the backend" was invisible/undiagnosable. All sync functions now return a
// SyncResult with the real Postgres/PostgREST error message, and always log
// it, so failures (RLS rejection, missing table, bad column, network error…)
// are actually surfaced instead of disappearing.
export interface SyncResult {
  success: boolean;
  error?: string;
}

function syncError(context: string, err: unknown): SyncResult {
  const message = (err as { message?: string })?.message || String(err);
  console.error(`Supabase sync error [${context}]:`, err);
  return { success: false, error: message };
}

// 1. Transactions Sync
export async function syncTransactionsToSupabase(transactions: Transaction[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  try {
    const rows = transactions.map((t) => ({
      id: t.id,
      title: t.title,
      amount: t.amount,
      type: t.type,
      category: t.category,
      subcategory: t.subcategory,
      date: t.date,
      time: t.time || '00:00',
      location: t.location || null,
      source: t.source || 'Manual',
      raw_text: t.rawText || null,
      payee_or_payer: t.payeeOrPayer || null,
      payment_method: t.paymentMethod || null,
      note: t.note || null,
    }));

    const { error } = await client.from('transactions').upsert(rows, { onConflict: 'id' });
    if (error) return syncError('transactions', error);
    return { success: true };
  } catch (err) {
    return syncError('transactions', err);
  }
}

export async function fetchTransactionsFromSupabase(): Promise<Transaction[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('transactions').select('*').order('date', { ascending: false });
    if (error) {
      console.error('Supabase fetch error [transactions]:', error);
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      amount: Number(row.amount),
      type: row.type,
      category: row.category,
      subcategory: row.subcategory,
      date: row.date,
      time: row.time,
      location: row.location,
      source: row.source,
      rawText: row.raw_text,
      payeeOrPayer: row.payee_or_payer,
      paymentMethod: row.payment_method,
      note: row.note,
    }));
  } catch {
    return null;
  }
}

// 2. Categories Sync
export async function syncCategoriesToSupabase(categories: Category[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  try {
    const rows = categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon_name: c.iconName,
      subcategories: c.subcategories || [],
      budget_limit: c.budgetLimit || 0,
    }));

    const { error } = await client.from('categories').upsert(rows, { onConflict: 'id' });
    if (error) return syncError('categories', error);
    return { success: true };
  } catch (err) {
    return syncError('categories', err);
  }
}

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('categories').select('*');
    if (error) {
      console.error('Supabase fetch error [categories]:', error);
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      iconName: row.icon_name,
      subcategories: row.subcategories || [],
      budgetLimit: Number(row.budget_limit || 0),
    }));
  } catch {
    return null;
  }
}

// 3. Financial Accounts Sync
export async function syncAccountsToSupabase(accounts: FinancialAccount[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  try {
    const rows = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      bank_name: a.bankName,
      type: a.type,
      account_number_last4: a.accountNumberLast4,
      balance: a.balance,
      credit_limit: a.creditLimit || 0,
      approx_monthly_bill: a.approxMonthlyBill || 0,
      due_date: a.dueDate || null,
      card_holder_name: a.cardHolderName || null,
      card_network: a.cardNetwork || null,
      card_color_theme: a.cardColorTheme || 'dark',
      is_default: Boolean(a.isDefault),
    }));

    const { error } = await client.from('financial_accounts').upsert(rows, { onConflict: 'id' });
    if (error) return syncError('financial_accounts', error);
    return { success: true };
  } catch (err) {
    return syncError('financial_accounts', err);
  }
}

export async function fetchAccountsFromSupabase(): Promise<FinancialAccount[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('financial_accounts').select('*');
    if (error) {
      console.error('Supabase fetch error [financial_accounts]:', error);
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      bankName: row.bank_name,
      type: row.type,
      accountNumberLast4: row.account_number_last4,
      balance: Number(row.balance),
      creditLimit: Number(row.credit_limit || 0),
      approxMonthlyBill: Number(row.approx_monthly_bill || 0),
      dueDate: row.due_date,
      cardHolderName: row.card_holder_name,
      cardNetwork: row.card_network,
      cardColorTheme: row.card_color_theme,
      isDefault: Boolean(row.is_default),
    }));
  } catch {
    return null;
  }
}

// 4. Investments Sync
export async function syncInvestmentsToSupabase(investments: InvestmentRecord[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  try {
    const rows = investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      amount_invested: inv.amountInvested,
      current_value: inv.currentValue,
      returns_percent: inv.returnsPercent,
      date: inv.date,
      monthly_contributions: inv.monthlyContributions || [],
      notes: inv.notes || null,
    }));

    const { error } = await client.from('investments').upsert(rows, { onConflict: 'id' });
    if (error) return syncError('investments', error);
    return { success: true };
  } catch (err) {
    return syncError('investments', err);
  }
}

export async function fetchInvestmentsFromSupabase(): Promise<InvestmentRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('investments').select('*');
    if (error) {
      console.error('Supabase fetch error [investments]:', error);
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      amountInvested: Number(row.amount_invested),
      currentValue: Number(row.current_value),
      returnsPercent: Number(row.returns_percent),
      date: row.date,
      monthlyContributions: row.monthly_contributions || [],
      notes: row.notes,
    }));
  } catch {
    return null;
  }
}

// 5. Loans Sync
export async function syncLoansToSupabase(loans: LoanRecord[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  try {
    const rows = loans.map((l) => ({
      id: l.id,
      title: l.title,
      person_or_bank: l.personOrBank,
      type: l.type,
      total_amount: l.totalAmount,
      remaining_amount: l.remainingAmount,
      interest_rate: l.interestRate || 0,
      due_date: l.dueDate || null,
      status: l.status,
      repayments: l.repayments || [],
      notes: l.notes || null,
    }));

    const { error } = await client.from('loans').upsert(rows, { onConflict: 'id' });
    if (error) return syncError('loans', error);
    return { success: true };
  } catch (err) {
    return syncError('loans', err);
  }
}

export async function fetchLoansFromSupabase(): Promise<LoanRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('loans').select('*');
    if (error) {
      console.error('Supabase fetch error [loans]:', error);
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      personOrBank: row.person_or_bank,
      type: row.type,
      totalAmount: Number(row.total_amount),
      remainingAmount: Number(row.remaining_amount),
      interestRate: Number(row.interest_rate || 0),
      dueDate: row.due_date,
      status: row.status,
      repayments: row.repayments || [],
      notes: row.notes,
    }));
  } catch {
    return null;
  }
}
