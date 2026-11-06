import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ShieldCheck, Ban, CheckCircle2, Gift, XCircle, Trash2, Eraser } from 'lucide-react';
import {
  AdminUserRow,
  AdminUsageSummary,
  deleteUser,
  deleteUserData,
  fetchAdminUsageSummary,
  fetchAdminUsers,
  grantSubscription,
  revokeSubscription,
  setUserSuspended,
} from '../services/adminService';

type Filter = 'all' | 'active' | 'premium' | 'free' | 'suspended';
type Grant = { plan: 'premium' | 'lifetime'; days: string; note: string };

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtAgo = (iso: string | null) => {
  if (!iso) return 'Never';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

const Stat: React.FC<{ label: string; value: number | string; hint?: string }> = ({ label, value, hint }) => (
  <div className="border border-line rounded-xl p-3 bg-surface-1">
    <div className="text-[10px] font-mono uppercase tracking-wider text-content-3">{label}</div>
    <div className="text-xl font-bold text-content-1 mt-1">{value}</div>
    {hint && <div className="text-[10px] text-content-3 mt-0.5">{hint}</div>}
  </div>
);

export const AdminView: React.FC<{ currentUserId?: string }> = ({ currentUserId }) => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [summary, setSummary] = useState<AdminUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [grantFor, setGrantFor] = useState<AdminUserRow | null>(null);
  const [grant, setGrant] = useState<Grant>({ plan: 'premium', days: '30', note: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ user: AdminUserRow; mode: 'data' | 'account'; typed: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stats] = await Promise.all([fetchAdminUsers(), fetchAdminUsageSummary()]);
      setUsers(list);
      setSummary(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return users.filter((u) => {
      if (q && !`${u.email} ${u.displayName ?? ''}`.toLowerCase().includes(q)) return false;
      switch (filter) {
        case 'active': return Boolean(u.lastSeenAt) && now - new Date(u.lastSeenAt!).getTime() < ACTIVE_WINDOW_MS;
        case 'premium': return u.subscriptionActive;
        case 'free': return !u.subscriptionActive;
        case 'suspended': return u.banned;
        default: return true;
      }
    });
  }, [users, query, filter]);

  const run = async (user: AdminUserRow, action: () => Promise<void>, success: string) => {
    setBusyId(user.userId);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const submitGrant = async () => {
    if (!grantFor) return;
    const days = Number(grant.days);
    if (grant.plan === 'premium' && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      setError('Enter a whole number of days between 1 and 3650.');
      return;
    }
    const target = grantFor;
    setGrantFor(null);
    await run(target, () => grantSubscription(target.userId, grant.plan, grant.plan === 'premium' ? days : null, grant.note),
      `Granted ${grant.plan} to ${target.email}`);
    setGrant({ plan: 'premium', days: '30', note: '' });
  };

  const submitDelete = async () => {
    if (!confirmDelete || confirmDelete.typed.trim().toLowerCase() !== confirmDelete.user.email.toLowerCase()) return;
    const { user, mode } = confirmDelete;
    setConfirmDelete(null);
    await run(
      user,
      () => (mode === 'data' ? deleteUserData(user.userId) : deleteUser(user.userId)),
      mode === 'data' ? `Deleted all data for ${user.email}` : `Deleted user ${user.email}`,
    );
  };

  const btn = 'inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[11px] font-mono hover:bg-surface-2 disabled:opacity-40 cursor-pointer';

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-content-1 font-bold">
          <ShieldCheck className="w-5 h-5 text-red-600" /> Admin Console
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={btn}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="text-xs border border-red-500/40 text-red-600 rounded-lg p-3">{error}</div>}
      {notice && <div role="status" className="text-xs border border-emerald-500/40 text-emerald-600 rounded-lg p-3">{notice}</div>}

      {summary && (
        <>
          <section aria-label="Users and subscriptions" className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total users" value={summary.totalUsers} hint={`${summary.newUsers7d} new in 7d`} />
            <Stat label="Active 24h" value={summary.activeUsers24h} />
            <Stat label="Active 7d" value={summary.activeUsers7d} hint={`${summary.activeUsers30d} in 30d`} />
            <Stat label="Subscribed" value={summary.premiumUsers} hint={`${summary.freeUsers} free · ${summary.suspendedUsers} suspended`} />
          </section>
          <section aria-label="Application usage" className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="App sessions" value={summary.totalSessions} />
            <Stat label="Transactions" value={summary.totalTransactions} />
            <Stat label="Accounts" value={summary.totalAccounts} />
            <Stat label="Investments" value={summary.totalInvestments} />
            <Stat label="Loans" value={summary.totalLoans} />
          </section>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search users</span>
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or name"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-line bg-surface-1 text-content-1"
          />
        </label>
        <select
          aria-label="Filter users"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="px-3 py-2 text-xs rounded-lg border border-line bg-surface-1 text-content-1"
        >
          <option value="all">All users</option>
          <option value="active">Active (7d)</option>
          <option value="premium">Subscribed</option>
          <option value="free">Free</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="space-y-2">
        {visible.map((u) => {
          const self = u.userId === currentUserId;
          const busy = busyId === u.userId;
          return (
            <div key={u.userId} className="border border-line rounded-xl p-3 bg-surface-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-content-1 truncate">
                    {u.displayName || u.email}
                    {u.isAdmin && <span className="ml-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600 text-white">ADMIN</span>}
                    {u.banned && <span className="ml-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-white">SUSPENDED</span>}
                  </div>
                  <div className="text-[11px] text-content-3 truncate">{u.email}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={busy} onClick={() => { setGrantFor(u); setError(null); }} className={btn}>
                    <Gift className="w-3 h-3" /> Grant
                  </button>
                  {u.subscriptionActive && (
                    <button type="button" disabled={busy} onClick={() => run(u, () => revokeSubscription(u.userId), `Revoked subscription for ${u.email}`)} className={btn}>
                      <XCircle className="w-3 h-3" /> Revoke
                    </button>
                  )}
                  {!self && !u.isAdmin && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(u, () => setUserSuspended(u.userId, !u.banned), u.banned ? `Reinstated ${u.email}` : `Suspended ${u.email}`)}
                      className={btn}
                    >
                      {u.banned ? <><CheckCircle2 className="w-3 h-3" /> Reinstate</> : <><Ban className="w-3 h-3" /> Suspend</>}
                    </button>
                  )}
                  {!self && !u.isAdmin && (
                    <>
                      <button type="button" disabled={busy} onClick={() => setConfirmDelete({ user: u, mode: 'data', typed: '' })} className={btn}>
                        <Eraser className="w-3 h-3" /> Delete data
                      </button>
                      <button type="button" disabled={busy} onClick={() => setConfirmDelete({ user: u, mode: 'account', typed: '' })} className={`${btn} text-red-600`}>
                        <Trash2 className="w-3 h-3" /> Delete user
                      </button>
                    </>
                  )}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-content-2">
                <div><dt className="inline text-content-3">Plan: </dt><dd className="inline font-semibold">{u.subscriptionActive ? u.plan : 'free'}</dd></div>
                <div><dt className="inline text-content-3">Expires: </dt><dd className="inline">{u.subscriptionActive ? (u.plan === 'lifetime' ? 'Never' : fmtDate(u.subscriptionExpiresAt)) : '—'}</dd></div>
                <div><dt className="inline text-content-3">Joined: </dt><dd className="inline">{fmtDate(u.createdAt)}</dd></div>
                <div><dt className="inline text-content-3">Last seen: </dt><dd className="inline">{fmtAgo(u.lastSeenAt)}</dd></div>
                <div><dt className="inline text-content-3">Sessions: </dt><dd className="inline">{u.sessionCount}</dd></div>
                <div><dt className="inline text-content-3">Device: </dt><dd className="inline">{u.platform ?? '—'}{u.appVersion ? ` v${u.appVersion}` : ''}</dd></div>
                <div><dt className="inline text-content-3">Txns / Accts: </dt><dd className="inline">{u.transactionCount} / {u.accountCount}</dd></div>
                <div><dt className="inline text-content-3">Invest / Loans: </dt><dd className="inline">{u.investmentCount} / {u.loanCount}</dd></div>
              </dl>
            </div>
          );
        })}
        {!loading && visible.length === 0 && <div className="text-xs text-content-3 text-center py-8">No users match.</div>}
      </div>

      {confirmDelete && (
        <div role="dialog" aria-modal="true" aria-label="Confirm deletion" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface-1 border border-line p-4 space-y-3">
            <div className="text-sm font-bold text-red-600">
              {confirmDelete.mode === 'data' ? 'Delete all user data' : 'Delete user permanently'}
            </div>
            <p className="text-[11px] text-content-2">
              {confirmDelete.mode === 'data'
                ? 'All transactions, accounts, categories, budgets, investments and loans of this user will be erased. The account stays.'
                : 'The account and every piece of its data will be erased. This cannot be undone.'}
            </p>
            <label className="block text-[11px] text-content-2">Type <b>{confirmDelete.user.email}</b> to confirm
              <input value={confirmDelete.typed} onChange={(e) => setConfirmDelete({ ...confirmDelete, typed: e.target.value })}
                className="mt-1 w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface-1 text-content-1" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className={btn}>Cancel</button>
              <button
                type="button"
                disabled={confirmDelete.typed.trim().toLowerCase() !== confirmDelete.user.email.toLowerCase()}
                onClick={() => void submitDelete()}
                className={`${btn} bg-red-600 text-white border-red-600`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {grantFor && (
        <div role="dialog" aria-modal="true" aria-label="Grant subscription" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface-1 border border-line p-4 space-y-3">
            <div className="text-sm font-bold text-content-1">Grant subscription</div>
            <div className="text-[11px] text-content-3 truncate">{grantFor.email}</div>
            <label className="block text-[11px] text-content-2">Plan
              <select value={grant.plan} onChange={(e) => setGrant({ ...grant, plan: e.target.value as Grant['plan'] })}
                className="mt-1 w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface-1 text-content-1">
                <option value="premium">Premium (time-limited)</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </label>
            {grant.plan === 'premium' && (
              <label className="block text-[11px] text-content-2">Days (extends current expiry)
                <input type="number" min={1} max={3650} value={grant.days} onChange={(e) => setGrant({ ...grant, days: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface-1 text-content-1" />
              </label>
            )}
            <label className="block text-[11px] text-content-2">Note (optional)
              <input maxLength={500} value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })}
                className="mt-1 w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface-1 text-content-1" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setGrantFor(null)} className={btn}>Cancel</button>
              <button type="button" onClick={() => void submitGrant()} className={`${btn} bg-slate-900 text-white dark:bg-white dark:text-black`}>Grant</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
