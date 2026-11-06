import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { isEligiblePaymentNotification } from './notification/transactionEligibility';
import type { FinancialAccount, LocationTag, Transaction } from '../types/finance';

export interface InterceptedPayment {
  id: string;
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
  action: 'review' | 'open' | 'add' | 'edit' | 'ignore' | 'saving' | 'saved';
  owner?: string;
  transaction?: Transaction;
  account?: FinancialAccount;
  localBalance?: number;
  /** Cash account credited by a background-saved ATM withdrawal. */
  cashAccount?: FinancialAccount;
  localCashBalance?: number;
  savedRevision?: number;
  description?: string;
  location?: Omit<LocationTag, 'name'> & { name?: string; capturedAt?: number };
}

interface NotificationInterceptPlugin {
  isPermissionGranted(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<void>;
  configure(options: { enabled: boolean; notifications: boolean; locationTracking: boolean; owner: string }): Promise<void>;
  reverseGeocode(options: { lat: number; lng: number }): Promise<{ name: string }>;
  getPending(): Promise<{ notifications: InterceptedPayment[] }>;
  resolvePayment(options: { id: string }): Promise<void>;
  acknowledgeAction(options: { id: string }): Promise<void>;
  acknowledgeSaved(options: { id: string }): Promise<void>;
  clearPayments(): Promise<void>;
  addListener(event: 'notificationReceived', callback: (data: InterceptedPayment) => void): Promise<PluginListenerHandle>;
}

const NotificationIntercept = registerPlugin<NotificationInterceptPlugin>('NotificationIntercept');

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

export async function configureNotificationInterceptor(enabled: boolean, notifications: boolean, locationTracking = false, owner = ''): Promise<void> {
  if (isNativeAndroid()) await NotificationIntercept.configure({ enabled, notifications, locationTracking, owner });
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
      if (payment.action !== 'ignore' && !isEligiblePaymentNotification(payment.packageName, payment.title, payment.text)) {
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
