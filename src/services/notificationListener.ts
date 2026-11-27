import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { isEligiblePaymentNotification } from './notification/transactionEligibility';
import type { FinancialAccount, LocationTag, Transaction } from '../types/finance';

export interface InterceptedPayment {
  id: string;
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
  action: 'review' | 'open' | 'add' | 'edit' | 'ignore' | 'saving' | 'saved' | 'category-review' | 'category-review-open';
  categoryReviewText?: string;
  owner?: string;
  transaction?: Transaction;
  account?: FinancialAccount;
  localBalance?: number;
  /** Cash account credited by a background-saved ATM withdrawal. */
  cashAccount?: FinancialAccount;
  localCashBalance?: number;
  savedRevision?: number;
  description?: string;
  categoryOverride?: string;
  location?: Omit<LocationTag, 'name'> & { name?: string; capturedAt?: number };
}

export interface AccountSuggestionAction {
  id: string;
  owner: string;
  last4: string;
  type: 'Bank' | 'Credit Card';
  action: 'open' | 'ignored';
}

export function isAccountSuggestionAction(value: unknown): value is AccountSuggestionAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Partial<AccountSuggestionAction>;
  return typeof action.id === 'string' && action.id.length > 0
    && typeof action.owner === 'string' && action.owner.length > 0
    && typeof action.last4 === 'string' && /^\d{4}$/.test(action.last4)
    && (action.type === 'Bank' || action.type === 'Credit Card')
    && (action.action === 'open' || action.action === 'ignored');
}

interface NotificationInterceptPlugin {
  acknowledgeCategoryReview(options: { id: string }): Promise<void>;
  categoryReview(options: { id: string; owner: string; title: string; remove: boolean }): Promise<{ displayed: boolean }>;
  isPermissionGranted(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<void>;
  configure(options: { enabled: boolean; notifications: boolean; locationTracking: boolean; owner: string; emailNotifications: boolean; knownAccounts: string[]; ignoredAccounts: string[] }): Promise<void>;
  reverseGeocode(options: { lat: number; lng: number }): Promise<{ name: string }>;
  getPending(): Promise<{ notifications: InterceptedPayment[] }>;
  resolvePayment(options: { id: string }): Promise<void>;
  acknowledgeAction(options: { id: string }): Promise<void>;
  acknowledgeSaved(options: { id: string }): Promise<void>;
  clearPayments(): Promise<void>;
  captureLocation(options: { id: string; lat: number; lng: number; name: string; capturedAt: number }): Promise<void>;
  addListener(event: 'notificationReceived', callback: (data: InterceptedPayment) => void): Promise<PluginListenerHandle>;
  addListener(event: 'accountSuggestionReceived', callback: (data: AccountSuggestionAction) => void): Promise<PluginListenerHandle>;
  getAccountActions(): Promise<{ actions: AccountSuggestionAction[] }>;
  acknowledgeAccountAction(options: { id: string }): Promise<void>;
}

const NotificationIntercept = registerPlugin<NotificationInterceptPlugin>('NotificationIntercept');

export async function acknowledgeCategoryReview(id: string): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.acknowledgeCategoryReview({ id });
}

export async function syncCategoryReviewNotification(owner: string, transactionId: string, remove: boolean, title = 'Saved transaction needs a category'): Promise<boolean> {
  if (!isNativeAndroid()) return true;
  return (await NotificationIntercept.categoryReview({
    id: transactionId, owner, title, remove,
  })).displayed;
}

export function reverseGeocodeNativeCoordinates(lat: number, lng: number): Promise<{ name: string }> {
  return NotificationIntercept.reverseGeocode({ lat, lng });
}

export function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function isNotificationAccessGranted(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    return (await NotificationIntercept.isPermissionGranted()).granted;
  } catch (error) {
    console.warn('Could not check notification access:', error);
    return false;
  }
}

export async function requestNotificationAccess(): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.requestPermission();
}

export async function configureNotificationInterceptor(enabled: boolean, notifications: boolean, locationTracking = false, owner = '', emailNotifications = false, knownAccounts: string[] = [], ignoredAccounts: string[] = []): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.configure({ enabled, notifications, locationTracking, owner, emailNotifications, knownAccounts, ignoredAccounts });
}

export async function acknowledgeAccountSuggestion(id: string): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.acknowledgeAccountAction({ id });
}

export function startAccountSuggestionListener(onAction: (action: AccountSuggestionAction) => void): () => void {
  if (!isNativeAndroid()) return () => {};
  let removed = false;
  let handle: PluginListenerHandle | undefined;
  const replay = () => {
    if (document.visibilityState === 'hidden') return;
    void NotificationIntercept.getAccountActions().then(result => {
      if (!removed) result.actions.forEach(onAction);
    }).catch(error => console.warn('Could not restore account suggestion actions:', error));
  };
  void NotificationIntercept.addListener('accountSuggestionReceived', onAction).then(listener => {
    if (removed) void listener.remove();
    else { handle = listener; replay(); }
  }).catch(error => console.warn('Could not listen for account suggestions:', error));
  document.addEventListener('visibilitychange', replay);
  return () => {
    removed = true;
    document.removeEventListener('visibilitychange', replay);
    if (handle) void handle.remove().catch(error => console.warn('Could not remove account suggestion listener:', error));
  };
}
export async function acknowledgeSavedPayment(id: string): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.acknowledgeSaved({ id });
}

export async function getSavedPayments(): Promise<InterceptedPayment[]> {
  if (!isNativeAndroid()) return [];
  return (await NotificationIntercept.getPending()).notifications.filter(payment => payment.action === 'saved');
}

export async function resolveInterceptedPayment(id: string): Promise<void> {
  if (isNativeAndroid() && id.startsWith('native_')) {
    await NotificationIntercept.resolvePayment({ id: id.slice(7) });
  }
}

export async function acknowledgePaymentAction(id: string): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.acknowledgeAction({ id });
}

export async function clearInterceptedPayments(): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.clearPayments();
}

export async function persistInterceptedLocation(payment: InterceptedPayment, location: LocationTag): Promise<void> {
  if (isNativeAndroid() && !payment.location) {
    await NotificationIntercept.captureLocation({ id: payment.id, ...location, capturedAt: Date.now() });
  }
}

export function startNotificationListener(onPayment: (payment: InterceptedPayment, isActive: () => boolean) => Promise<void>): () => void {
  if (!isNativeAndroid()) return () => {};
  let removed = false;
  let handle: PluginListenerHandle | undefined;
  let chain = Promise.resolve();
  const enqueue = (payment: InterceptedPayment) => {
    chain = chain.then(async () => {
      if (removed) return;
      if (payment.action === 'saving') return;
      if (payment.action === 'saved' && document.visibilityState === 'hidden') return;
      if (payment.action !== 'ignore' && !payment.action.startsWith('category-review')
        && !isEligiblePaymentNotification(payment.packageName, payment.title, payment.text)) {
        await NotificationIntercept.resolvePayment({ id: payment.id });
        return;
      }
      await onPayment(payment, () => !removed);
    }).catch(error => console.warn('Could not process intercepted payment; retained for retry:', error));
  };
  const replay = () => {
    if (document.visibilityState === 'hidden') return;
    void NotificationIntercept.getPending().then(result => {
      if (!removed) result.notifications.forEach(enqueue);
    }).catch(error => console.warn('Could not restore intercepted payments:', error));
  };
  void NotificationIntercept.addListener('notificationReceived', enqueue).then(listener => {
    if (removed) void listener.remove();
    else { handle = listener; replay(); }
  }).catch(error => console.warn('Failed to attach notification listener:', error));
  document.addEventListener('visibilitychange', replay);
  return () => {
    removed = true;
    document.removeEventListener('visibilitychange', replay);
    if (handle) void handle.remove().catch(error => console.warn('Could not remove payment listener:', error));
  };
}
