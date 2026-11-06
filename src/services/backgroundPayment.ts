import type { InterceptedPayment } from './notificationListener';
import type { ParsedNotification } from '../types/finance';
import { parseNotification } from './notification/ParserManager';
import { isEligiblePaymentNotification } from './notification/transactionEligibility';
import { createPaymentTransaction } from '../utils/paymentTransaction';
import { toLocalISODate } from '../utils/dates';
import { isFinancialAccount } from '../utils/backup';
import {
  getSupabaseClient, fetchTransactionsFromSupabase, fetchAccountsFromSupabase,
  fetchCategoriesFromSupabase, isConfirmedEmailUser,
} from './supabaseClient';

interface BackgroundBridge {
  input(): string;
  locationName(lat: number, lng: number): string | null;
  complete(result: string): boolean;
  fail(message: string): void;
}

declare global {
  interface Window { PaymentBackground?: BackgroundBridge }
}

async function savePayment(bridge: BackgroundBridge) {
  if (!navigator.locks) throw new Error('Update Android System WebView to enable background payment saving');
  return navigator.locks.request('minarth-account-cloud-write', () => savePaymentWithLock(bridge));
}

async function savePaymentWithLock(bridge: BackgroundBridge) {
  const payment: InterceptedPayment = JSON.parse(bridge.input());
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud backend is not configured');
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!isConfirmedEmailUser(data.user) || !payment.owner || data.user?.id !== payment.owner) {
    throw new Error('Sign in to the account that received this payment to save it');
  }
  const cacheOwner = localStorage.getItem('tmf_cache_owner');
  const localAccounts: unknown = cacheOwner === payment.owner
    ? JSON.parse(localStorage.getItem('tmf_accounts') || '[]') : [];
  if (!Array.isArray(localAccounts) || !localAccounts.every(isFinancialAccount)) throw new Error('Invalid device account cache');
  if (!isEligiblePaymentNotification(payment.packageName, payment.title, payment.text)) {
    throw new Error('This alert is not an eligible completed payment');
  }
  const [transactions, accounts, categories] = await Promise.all([
    fetchTransactionsFromSupabase(), fetchAccountsFromSupabase(), fetchCategoriesFromSupabase(),
  ]);
  if (!transactions || !accounts || !categories) throw new Error('Cloud unavailable; payment retained for retry');
  const existing = transactions.find(transaction => transaction.id === `tx_native_${payment.id}`);
  if (existing) {
    if (!bridge.complete(JSON.stringify({
      owner: payment.owner, transaction: existing, account: accounts.find(account => account.id === existing.accountId),
      localBalance: localAccounts.find(account => account.id === existing.accountId)?.balance,
    }))) throw new Error('Could not persist background payment receipt');
    return;
  }
  const result = parseNotification(`${payment.title} ${payment.text}`, null, transactions, [], false);
  if (!result) throw new Error('Could not parse this payment. Use Edit in the app to review it');
  if (result.isDuplicate) {
    if (!bridge.complete(JSON.stringify({ owner: payment.owner, duplicate: true }))) throw new Error('Could not persist duplicate payment receipt');
    return;
  }
  const posted = new Date(payment.postedAt);
  if (!Number.isFinite(posted.getTime())) throw new Error('Invalid payment timestamp');
  const location = payment.location;
  if (location && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)
    || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180)) throw new Error('Invalid captured payment location');
  const locationName = location
    ? location.name?.trim() || bridge.locationName(location.lat, location.lng) : undefined;
  if (location && !locationName) console.warn('Readable captured payment location unavailable; coordinates retained');
  const parsed: ParsedNotification = {
    ...result.parsed, id: `native_${payment.id}`, description: payment.description,
    date: toLocalISODate(posted),
    time: `${String(posted.getHours()).padStart(2, '0')}:${String(posted.getMinutes()).padStart(2, '0')}`,
    location: location ? { lat: location.lat, lng: location.lng, name: locationName || 'Location name unavailable' } : undefined,
  };
  const { transaction } = createPaymentTransaction(parsed, accounts, categories);
  const { data: saved, error: saveError } = await client.rpc('add_notification_payment', {
    payment: transaction, expected_user: payment.owner,
  });
  if (saveError) throw new Error(saveError.code === 'PGRST202'
    ? 'Background payment database migration is required. Payment retained for retry'
    : saveError.message);
  if (!saved || typeof saved.saved !== 'boolean') throw new Error('Invalid background payment save response');
  const account = accounts.find(value => value.id === transaction.accountId);
  if (account && (typeof saved.balance !== 'number' || !Number.isFinite(saved.balance))) {
    throw new Error('Invalid background account balance response');
  }
  if (!bridge.complete(JSON.stringify(saved.saved
    ? {
      owner: payment.owner, transaction, account: account ? { ...account, balance: saved.balance } : undefined,
      localBalance: localAccounts.find(value => value.id === transaction.accountId)?.balance,
    }
    : { owner: payment.owner, duplicate: true }))) throw new Error('Could not persist background payment receipt');
}

if (window.PaymentBackground) {
  const bridge = window.PaymentBackground;
  void savePayment(bridge).catch(error => {
    console.error('Background payment save failed:', error instanceof Error ? error.message : 'Unknown error');
    bridge.fail(error instanceof Error ? error.message : 'Could not save payment');
  });
}
