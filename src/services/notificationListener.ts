import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Bridge to the native Android "NotificationIntercept" plugin (see
 * native/notification-intercept-plugin). On Android, this plugin runs a
 * NotificationListenerService that observes system notifications posted by
 * banking / UPI apps (GPay, PhonePe, Paytm, bank SMS apps, etc.) and forwards
 * their text to JS in real time — this is what makes "auto-read new
 * transaction notification -> auto add record" actually work on-device,
 * instead of only working through the manual SMS Simulator.
 *
 * On web (or before the user grants the special "Notification Access"
 * permission), this is a safe no-op so the rest of the app keeps working.
 */
export interface NotificationInterceptPlugin {
  /** True if the OS-level "Notification Access" permission is already granted. */
  isPermissionGranted(): Promise<{ granted: boolean }>;
  /** Opens the system settings screen where the user grants Notification Access. */
  requestPermission(): Promise<void>;
  addListener(
    eventName: 'notificationReceived',
    listenerFunc: (data: { packageName: string; title: string; text: string; postedAt: number }) => void
  ): Promise<{ remove: () => void }> | any;
}

const NotificationIntercept = registerPlugin<NotificationInterceptPlugin>('NotificationIntercept');

export function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function isNotificationAccessGranted(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const { granted } = await NotificationIntercept.isPermissionGranted();
    return granted;
  } catch {
    return false;
  }
}

/** Deep-links the user to Android's "Notification Access" settings screen. */
export async function requestNotificationAccess(): Promise<void> {
  if (!isNativeAndroid()) return;
  await NotificationIntercept.requestPermission();
}

// Only notifications from apps that plausibly carry bank/UPI transaction
// alerts are forwarded to the parser — this avoids spamming the pending queue
// with unrelated app notifications (chat apps, games, etc.).
const RELEVANT_PACKAGE_HINTS = [
  'com.google.android.apps.nbu.paisa', // Google Pay
  'com.phonepe.app',
  'net.one97.paytm',
  'com.csam.icici.bank.imobile',
  'com.snapwork.hdfc',
  'com.sbi.lotusintouch',
  'com.axis.mobile',
  'com.android.mms', // default SMS app (bank SMS alerts)
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
];

function looksLikeTransactionText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /(rs\.?|inr|₹|\$)\s*[\d,]+/.test(lower) ||
    lower.includes('debited') ||
    lower.includes('credited') ||
    lower.includes('sent') ||
    lower.includes('received') ||
    lower.includes('spent') ||
    lower.includes('paid')
  );
}

/**
 * Starts listening for real, on-device bank/UPI notifications. Returns a
 * cleanup function to stop listening. Safe to call on web (does nothing).
 */
export function startNotificationListener(onTransactionText: (rawText: string) => void): () => void {
  if (!isNativeAndroid()) {
    return () => {};
  }

  let removed = false;
  let removeFn: (() => void) | null = null;

  NotificationIntercept.addListener('notificationReceived', (data) => {
    const combinedText = `${data.title || ''} ${data.text || ''}`.trim();
    if (!combinedText) return;

    const isRelevantApp = RELEVANT_PACKAGE_HINTS.some((pkg) => data.packageName?.includes(pkg));
    if (!isRelevantApp && !looksLikeTransactionText(combinedText)) return;
    if (!looksLikeTransactionText(combinedText)) return;

    onTransactionText(combinedText);
  }).then((handle: { remove: () => void }) => {
    if (removed) {
      handle.remove();
    } else {
      removeFn = () => handle.remove();
    }
  }).catch((err: unknown) => {
    console.warn('Failed to attach notification listener:', err);
  });

  return () => {
    removed = true;
    if (removeFn) removeFn();
  };
}
