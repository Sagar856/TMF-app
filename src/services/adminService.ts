import { getSupabaseClient } from './supabaseClient';

export type SubscriptionPlan = 'free' | 'premium' | 'lifetime';

export interface AdminUserRow {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  banned: boolean;
  isAdmin: boolean;
  plan: SubscriptionPlan;
  subscriptionActive: boolean;
  subscriptionExpiresAt: string | null;
  lastSeenAt: string | null;
  sessionCount: number;
  platform: string | null;
  appVersion: string | null;
  transactionCount: number;
  accountCount: number;
  investmentCount: number;
  loanCount: number;
}

export interface AdminUsageSummary {
  totalUsers: number;
  verifiedUsers: number;
  newUsers7d: number;
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  premiumUsers: number;
  freeUsers: number;
  suspendedUsers: number;
  totalTransactions: number;
  totalAccounts: number;
  totalInvestments: number;
  totalLoans: number;
  totalSessions: number;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud backend is not configured for this build');
  return client;
}

const num = (value: unknown): number => Number(value) || 0;

// Authoritative check happens server-side in every admin RPC; this only decides
// whether to show the admin UI.
export async function checkIsAdmin(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data, error } = await client.rpc('is_admin');
  return !error && data === true;
}

export async function recordActivity(platform: string, appVersion: string, newSession: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.rpc('record_activity', { p_platform: platform, p_app_version: appVersion, p_new_session: newSession });
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const { data, error } = await requireClient().rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    userId: String(row.user_id),
    email: String(row.email ?? ''),
    displayName: (row.display_name as string | null) ?? null,
    createdAt: String(row.created_at),
    lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
    emailConfirmed: row.email_confirmed === true,
    banned: row.banned === true,
    isAdmin: row.is_admin === true,
    plan: (row.plan as SubscriptionPlan) ?? 'free',
    subscriptionActive: row.subscription_active === true,
    subscriptionExpiresAt: (row.subscription_expires_at as string | null) ?? null,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    sessionCount: num(row.session_count),
    platform: (row.platform as string | null) ?? null,
    appVersion: (row.app_version as string | null) ?? null,
    transactionCount: num(row.transaction_count),
    accountCount: num(row.account_count),
    investmentCount: num(row.investment_count),
    loanCount: num(row.loan_count),
  }));
}

export async function fetchAdminUsageSummary(): Promise<AdminUsageSummary> {
  const { data, error } = await requireClient().rpc('admin_usage_summary');
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error('No usage data returned');
  return {
    totalUsers: num(row.total_users),
    verifiedUsers: num(row.verified_users),
    newUsers7d: num(row.new_users_7d),
    activeUsers24h: num(row.active_users_24h),
    activeUsers7d: num(row.active_users_7d),
    activeUsers30d: num(row.active_users_30d),
    premiumUsers: num(row.premium_users),
    freeUsers: num(row.free_users),
    suspendedUsers: num(row.suspended_users),
    totalTransactions: num(row.total_transactions),
    totalAccounts: num(row.total_accounts),
    totalInvestments: num(row.total_investments),
    totalLoans: num(row.total_loans),
    totalSessions: num(row.total_sessions),
  };
}

export async function grantSubscription(userId: string, plan: 'premium' | 'lifetime', days: number | null, note: string): Promise<void> {
  const { error } = await requireClient().rpc('admin_grant_subscription', {
    p_user_id: userId,
    p_plan: plan,
    p_days: plan === 'premium' ? days : null,
    p_note: note.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function revokeSubscription(userId: string): Promise<void> {
  const { error } = await requireClient().rpc('admin_revoke_subscription', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

export async function deleteUserData(userId: string): Promise<void> {
  const { error } = await requireClient().rpc('admin_delete_user_data', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await requireClient().rpc('admin_delete_user', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

export async function setUserSuspended(userId: string, suspended: boolean): Promise<void> {
  const { error } = await requireClient().rpc('admin_set_user_suspended', { p_user_id: userId, p_suspended: suspended });
  if (error) throw new Error(error.message);
}
