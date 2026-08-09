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
  'com.phonepe.app', // PhonePe
  'net.one97.paytm', // Paytm
  'com.dreamplug.androidapp', // CRED
  'in.org.npci.upiapp', // BHIM
  'com.epifi.fi.money', // Fi Money
  'money.jupiter', // Jupiter
  'com.sliceit', // Slice
  'com.navi.app', // Navi
  'com.mobikwik', // Mobikwik
  'com.amazon.mws.gno', // Amazon
  'com.whatsapp', // WhatsApp Pay
  'com.csam.icici.bank.imobile', // ICICI iMobile
  'com.snapwork.hdfc', // HDFC MobileBanking
  'com.sbi.lotusintouch', // SBI Yono / Anywhere
  'com.sbi.yonobusiness',
  'com.axis.mobile', // Axis Mobile
  'com.msf.kof', // Kotak Mobile Banking
  'com.pnb.mobile', // PNB ONE
  'com.bankofbaroda.mconnect', // BOB World
  'com.canarabank.mob', // Canara ai1
  'com.idfcfirstbank.mobile', // IDFC FIRST
  'com.indusind.mobile', // IndusMobile
  'com.fedmobile', // FedMobile
  'com.android.mms', // Default System SMS
  'com.google.android.apps.messaging', // Google Messages
  'com.samsung.android.messaging', // Samsung Messages
  'com.oneplus.mms', // OnePlus Messages
  'com.miui.smsextra', // Xiaomi SMS
  'com.oppo.mms', // Oppo/Realme Messages
  'com.vivo.mms', // Vivo Messages
  'com.truecaller', // Truecaller SMS
];

function looksLikeTransactionText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /(rs\.?|inr|₹|\$|eur|€|gbp|£)\s*[\d,]+/.test(lower) ||
    lower.includes('debited') ||
    lower.includes('credited') ||
    lower.includes('sent') ||
    lower.includes('received') ||
    lower.includes('spent') ||
    lower.includes('paid') ||
    lower.includes('transferred') ||
    lower.includes('withdrawn') ||
    lower.includes('cashback') ||
    lower.includes('refunded') ||
    lower.includes('salary')
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
