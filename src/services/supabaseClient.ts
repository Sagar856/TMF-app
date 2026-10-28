import { createClient, SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Transaction, Category, FinancialAccount, InvestmentRecord, LoanRecord } from '../types/finance';

let supabaseInstance: SupabaseClient | null = null;
let clientInitAttempted = false;

function isValidHttpUrl(stringUrl?: string): boolean {
  if (!stringUrl || typeof stringUrl !== 'string') return false;
  const trimmed = stringUrl.trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.includes('YOUR_SUPABASE') ||
    trimmed.includes('example.supabase.co')
  ) {
    return false;
  }
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isNetworkOrFetchError(err: unknown): boolean {
  if (!err) return false;
  const msg = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message).toLowerCase()
    : String(err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('load failed') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('err_connection_refused') ||
    msg.includes('typeerror: failed to fetch')
  );
}

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
  const rawBackendUrl = metaEnv.VITE_SUPABASE_URL?.trim();
  const supabaseKey = metaEnv.VITE_SUPABASE_ANON_KEY?.trim();

  clientInitAttempted = true;

  if (!isValidHttpUrl(rawBackendUrl) || !supabaseKey || supabaseKey === 'undefined' || supabaseKey === 'null' || supabaseKey.includes('YOUR_SUPABASE')) {
    console.warn('Cloud sync is disabled: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not configured or invalid.');
    return null;
  }

  try {
    supabaseInstance = createClient(rawBackendUrl!, supabaseKey);
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
  if (!client) throw new Error("Cloud backend is not configured for this build");

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
  if (!client) throw new Error("Cloud backend is not configured for this build");

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
  if (!client) throw new Error('Cloud backend is not configured for this build');

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
  if (!client) throw new Error('Cloud backend is not configured for this build');

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
  /** Non-fatal: the write succeeded but some columns were skipped because the cloud schema is outdated. */
  warning?: string;
  /** True when the error/warning is caused by the deployed Supabase schema missing columns from supabase_schema.sql. */
  schemaOutdated?: boolean;
}

export const SCHEMA_OUTDATED_HINT =
  'Run the latest supabase_schema.sql in your Supabase SQL Editor to update the cloud schema.';

// PostgREST reports an unknown column as PGRST204:
// "Could not find the 'ref_number' column of 'transactions' in the schema cache".
// Postgres itself (e.g. when a *filter* references the column) reports 42703:
// "column transactions.deleted_at does not exist".
function extractMissingColumn(err: unknown): string | null {
  const e = err as { code?: string; message?: string } | null;
  const message = e?.message || '';
  const match = /could not find the '([^']+)' column/i.exec(message);
  if (match) return match[1];
  const pgMatch = /column (?:[\w"]+\.)?"?([\w]+)"? does not exist/i.exec(message);
  if (pgMatch) return pgMatch[1];
  if (e?.code === 'PGRST204' || e?.code === '42703') {
    const alt = /'([^']+)'/.exec(message);
    return alt ? alt[1] : null;
  }
  return null;
}

type UpsertRow = Record<string, unknown>;

/** Minimal shape of the PostgREST builder we rely on (keeps the helper testable without a live client). */
export interface UpsertClientLike {
  from(table: string): {
    upsert(rows: UpsertRow[], options: { onConflict: string }): PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
}

// Upserts rows and, when the live schema lacks a column the app now writes,
// strips that column and retries so a stale cloud schema degrades to a
// warning instead of blocking every sync of the whole collection.
export async function upsertWithSchemaFallback(
  client: UpsertClientLike,
  table: string,
  rows: UpsertRow[],
  context: string
): Promise<SyncResult> {
  const skipped: string[] = [];
  let currentRows = rows;
  // Bounded retry loop: each pass can remove at most one missing column.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await client.from(table).upsert(currentRows, { onConflict: 'user_id,id' });
    if (!error) {
      if (skipped.length === 0) return { success: true };
      const warning = `Cloud schema is outdated: ${skipped.join(', ')} not synced for ${context}. ${SCHEMA_OUTDATED_HINT}`;
      console.warn(`Supabase sync warning [${context}]:`, warning);
      return { success: true, warning, schemaOutdated: true };
    }
    const missing = extractMissingColumn(error);
    if (!missing || skipped.includes(missing) || missing === 'id' || missing === 'user_id') {
      const result = syncError(context, error);
      return missing ? { ...result, schemaOutdated: true, error: `${result.error}. ${SCHEMA_OUTDATED_HINT}` } : result;
    }
    skipped.push(missing);
    currentRows = currentRows.map((row) => {
      const { [missing]: _dropped, ...rest } = row;
      return rest;
    });
  }
  return { success: false, error: `Could not sync ${context}: too many missing columns. ${SCHEMA_OUTDATED_HINT}`, schemaOutdated: true };
}

function syncError(context: string, err: unknown): SyncResult {
  const message = (err as { message?: string })?.message || String(err);
  if (isNetworkOrFetchError(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    console.warn(`Supabase sync offline/unreachable [${context}]: Cloud backend unreachable. Changes are saved locally.`);
    return { success: false, error: 'Cloud offline or unreachable. Changes saved in local storage.' };
  }
  console.warn(`Supabase sync issue [${context}]:`, message);
  return { success: false, error: message };
}

type SyncTable = 'transactions' | 'categories' | 'financial_accounts' | 'investments' | 'loans';

function isMissingColumnError(err: unknown, column: string): boolean {
  const missing = extractMissingColumn(err);
  return missing === column;
}

/**
 * Soft-deletes rows by stamping `deleted_at` (a tombstone every device will
 * see on its next fetch). Falls back to a hard delete when the live schema
 * predates the tombstone column. Always scoped to the signed-in user as
 * defense in depth alongside RLS.
 */
async function deleteRows(table: SyncTable, ids: string[], context: string): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };
  if (ids.length === 0) return { success: true };

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { success: false, error: 'Not signed in' };

    const now = new Date().toISOString();
    if (tombstoneColumnSupported !== false) {
      const soft = await client
        .from(table)
        .update({ deleted_at: now })
        .eq('user_id', user.id)
        .in('id', ids);
      if (!soft.error) {
        tombstoneColumnSupported = true;
        return { success: true };
      }
      if (!isMissingColumnError(soft.error, 'deleted_at')) return syncError(context, soft.error);
      tombstoneColumnSupported = false;
    }

    const hard = await client.from(table).delete().eq('user_id', user.id).in('id', ids);
    if (hard.error) return syncError(context, hard.error);
    return { success: true, warning: `Cloud schema is outdated: deletions are not tombstoned for ${table}. ${SCHEMA_OUTDATED_HINT}`, schemaOutdated: true };
  } catch (err) {
    return syncError(context, err);
  }
}

/**
 * Fetches live rows (tombstones excluded). On schemas without `deleted_at`
 * the plain select is used instead. Rows are untyped (`any`) exactly like the
 * previous `select('*')` calls so the per-table mappers keep working.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;
interface SelectResult {
  data: AnyRow[] | null;
  error: { message?: string; code?: string } | null;
}

// Remembered per session so an old schema isn't probed on every fetch/delete.
let tombstoneColumnSupported: boolean | null = null;

async function selectLiveRows(table: SyncTable, orderBy?: { column: string; ascending: boolean }): Promise<SelectResult> {
  const client = getSupabaseClient();
  if (!client) return { data: null, error: null };
  if (tombstoneColumnSupported !== false) {
    let query = client.from(table).select('*').is('deleted_at', null);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending });
    const first = await query;
    if (!first.error) {
      tombstoneColumnSupported = true;
      return { data: first.data as AnyRow[], error: null };
    }
    if (!isMissingColumnError(first.error, 'deleted_at')) return { data: null, error: first.error };
    tombstoneColumnSupported = false;
  }
  let fallback = client.from(table).select('*');
  if (orderBy) fallback = fallback.order(orderBy.column, { ascending: orderBy.ascending });
  const second = await fallback;
  return { data: (second.data as AnyRow[] | null) ?? null, error: second.error };
}

export interface CloudTombstones {
  transactions: string[];
  accounts: string[];
  categories: string[];
  investments: string[];
  loans: string[];
}

/** IDs deleted on any device. Empty arrays when the schema has no tombstones yet. */
export async function fetchCloudTombstones(): Promise<CloudTombstones> {
  const empty: CloudTombstones = { transactions: [], accounts: [], categories: [], investments: [], loans: [] };
  const client = getSupabaseClient();
  if (!client || tombstoneColumnSupported === false) return empty;
  const tables: Array<[keyof CloudTombstones, SyncTable]> = [
    ['transactions', 'transactions'],
    ['accounts', 'financial_accounts'],
    ['categories', 'categories'],
    ['investments', 'investments'],
    ['loans', 'loans'],
  ];
  const results = await Promise.all(
    tables.map(async ([key, table]) => {
      try {
        const { data, error } = await client.from(table).select('id').not('deleted_at', 'is', null);
        if (error || !data) return [key, []] as const;
        return [key, (data as { id: string }[]).map((r) => r.id)] as const;
      } catch {
        return [key, []] as const;
      }
    })
  );
  return results.reduce<CloudTombstones>((acc, [key, ids]) => ({ ...acc, [key]: ids }), empty);
}

// 1. Transactions Sync
export async function syncTransactionsToSupabase(transactions: Transaction[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in' };

  try {
    const rows = transactions.map((t) => ({
      id: t.id,
      user_id: user.id,
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
      ref_number: t.refNumber || null,
      kind: t.kind || null,
      account_id: t.accountId || null,
      to_account_id: t.toAccountId || null,
    }));

    return upsertWithSchemaFallback(client, 'transactions', rows, 'transactions');
  } catch (err) {
    return syncError('transactions', err);
  }
}

export async function deleteTransactionFromSupabase(id: string): Promise<SyncResult> {
  return deleteRows('transactions', [id], 'delete-transaction');
}

export async function deleteMultipleTransactionsFromSupabase(ids: string[]): Promise<SyncResult> {
  return deleteRows('transactions', ids, 'delete-multiple-transactions');
}

export async function fetchTransactionsFromSupabase(): Promise<Transaction[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await selectLiveRows('transactions', { column: 'date', ascending: false });
    if (error) {
      if (isNetworkOrFetchError(error)) {
        console.warn('Supabase fetch [transactions]: Cloud backend is currently offline. Using local data.');
      } else {
        console.warn('Supabase fetch issue [transactions]:', error.message || error);
      }
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
      refNumber: row.ref_number || undefined,
      kind: row.kind || undefined,
      accountId: row.account_id || undefined,
      toAccountId: row.to_account_id || undefined,
    }));
  } catch (err) {
    if (isNetworkOrFetchError(err)) {
      console.warn('Supabase fetch [transactions]: Network unreachable. Using local data.');
    } else {
      console.warn('Supabase fetch error [transactions]:', err);
    }
    return null;
  }
}

// 2. Categories Sync
export async function syncCategoriesToSupabase(categories: Category[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in' };

  try {
    const rows = categories.map((c) => ({
      id: c.id,
      user_id: user.id,
      name: c.name,
      type: c.type,
      icon_name: c.iconName,
      subcategories: c.subcategories || [],
      budget_limit: c.budgetLimit || 0,
    }));

    return upsertWithSchemaFallback(client, 'categories', rows, 'categories');
  } catch (err) {
    return syncError('categories', err);
  }
}

export async function deleteCategoryFromSupabase(id: string): Promise<SyncResult> {
  return deleteRows('categories', [id], 'delete-categorie');
}

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await selectLiveRows('categories');
    if (error) {
      if (isNetworkOrFetchError(error)) {
        console.warn('Supabase fetch [categories]: Cloud backend is currently offline. Using local data.');
      } else {
        console.warn('Supabase fetch issue [categories]:', error.message || error);
      }
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
  } catch (err) {
    if (isNetworkOrFetchError(err)) {
      console.warn('Supabase fetch [categories]: Network unreachable. Using local data.');
    } else {
      console.warn('Supabase fetch error [categories]:', err);
    }
    return null;
  }
}

// 3. Financial Accounts Sync
export async function syncAccountsToSupabase(accounts: FinancialAccount[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in' };

  try {
    const rows = accounts.map((a) => ({
      id: a.id,
      user_id: user.id,
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

    return upsertWithSchemaFallback(client, 'financial_accounts', rows, 'financial_accounts');
  } catch (err) {
    return syncError('financial_accounts', err);
  }
}

export async function deleteAccountFromSupabase(id: string): Promise<SyncResult> {
  return deleteRows('financial_accounts', [id], 'delete-financial-account');
}

export async function deleteMultipleAccountsFromSupabase(ids: string[]): Promise<SyncResult> {
  return deleteRows('financial_accounts', ids, 'delete-multiple-financial-accounts');
}

export async function fetchAccountsFromSupabase(): Promise<FinancialAccount[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await selectLiveRows('financial_accounts');
    if (error) {
      if (isNetworkOrFetchError(error)) {
        console.warn('Supabase fetch [financial_accounts]: Cloud backend is currently offline. Using local data.');
      } else {
        console.warn('Supabase fetch issue [financial_accounts]:', error.message || error);
      }
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
  } catch (err) {
    if (isNetworkOrFetchError(err)) {
      console.warn('Supabase fetch [financial_accounts]: Network unreachable. Using local data.');
    } else {
      console.warn('Supabase fetch error [financial_accounts]:', err);
    }
    return null;
  }
}

// 4. Investments Sync
export async function syncInvestmentsToSupabase(investments: InvestmentRecord[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in' };

  try {
    const rows = investments.map((inv) => ({
      id: inv.id,
      user_id: user.id,
      name: inv.name,
      type: inv.type,
      amount_invested: inv.amountInvested,
      current_value: inv.currentValue,
      returns_percent: inv.returnsPercent,
      date: inv.date,
      monthly_contributions: inv.monthlyContributions || [],
      notes: inv.notes || null,
      details: inv,
    }));

    return upsertWithSchemaFallback(client, 'investments', rows, 'investments');
  } catch (err) {
    return syncError('investments', err);
  }
}

export async function deleteInvestmentFromSupabase(id: string): Promise<SyncResult> {
  return deleteRows('investments', [id], 'delete-investment');
}

export async function deleteMultipleInvestmentsFromSupabase(ids: string[]): Promise<SyncResult> {
  return deleteRows('investments', ids, 'delete-multiple-investments');
}

export async function fetchInvestmentsFromSupabase(): Promise<InvestmentRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await selectLiveRows('investments');
    if (error) {
      if (isNetworkOrFetchError(error)) {
        console.warn('Supabase fetch [investments]: Cloud backend is currently offline. Using local data.');
      } else {
        console.warn('Supabase fetch issue [investments]:', error.message || error);
      }
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      ...(row.details ?? {}),
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
  } catch (err) {
    if (isNetworkOrFetchError(err)) {
      console.warn('Supabase fetch [investments]: Network unreachable. Using local data.');
    } else {
      console.warn('Supabase fetch error [investments]:', err);
    }
    return null;
  }
}

// 5. Loans Sync
export async function syncLoansToSupabase(loans: LoanRecord[]): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in' };

  try {
    const rows = loans.map((l) => ({
      id: l.id,
      user_id: user.id,
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
      details: l,
    }));

    return upsertWithSchemaFallback(client, 'loans', rows, 'loans');
  } catch (err) {
    return syncError('loans', err);
  }
}

export async function deleteLoanFromSupabase(id: string): Promise<SyncResult> {
  return deleteRows('loans', [id], 'delete-loan');
}

export async function deleteMultipleLoansFromSupabase(ids: string[]): Promise<SyncResult> {
  return deleteRows('loans', ids, 'delete-multiple-loans');
}

export async function deleteAllUserDataFromSupabase(): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase is not configured.' };

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { success: false, error: 'Not signed in' };
    // Explicit user scope as defense in depth alongside RLS. Hard delete is
    // intentional here: "Reset all data" must also remove tombstones.
    const tables: SyncTable[] = ['transactions', 'categories', 'financial_accounts', 'investments', 'loans'];
    const results = await Promise.all(tables.map((t) => client.from(t).delete().eq('user_id', user.id)));

    for (const res of results) {
      if (res.error) {
        return syncError('delete-all-data', res.error);
      }
    }
    return { success: true };
  } catch (err) {
    return syncError('delete-all-data', err);
  }
}

export async function fetchLoansFromSupabase(): Promise<LoanRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await selectLiveRows('loans');
    if (error) {
      if (isNetworkOrFetchError(error)) {
        console.warn('Supabase fetch [loans]: Cloud backend is currently offline. Using local data.');
      } else {
        console.warn('Supabase fetch issue [loans]:', error.message || error);
      }
      return null;
    }
    if (!data) return null;

    return data.map((row) => ({
      ...(row.details ?? {}),
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
  } catch (err) {
    if (isNetworkOrFetchError(err)) {
      console.warn('Supabase fetch [loans]: Network unreachable. Using local data.');
    } else {
      console.warn('Supabase fetch error [loans]:', err);
    }
    return null;
  }
}
