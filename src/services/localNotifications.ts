import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import type { ParsedNotification } from '../types/finance';

let permissionRequested = false;

async function ensurePermission(): Promise<boolean> {
  if (Capacitor.getPlatform() === 'web') return false;
  if (!permissionRequested) {
    permissionRequested = true;
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  }
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted';
}

/**
 * Posts a native "Add this transaction?" notification the moment a bank/UPI
 * notification has been auto-intercepted and parsed. Tapping it opens the app
 * (the pending-notification queue / prompt modal picks it up automatically).
 */
export async function notifyTransactionDetected(notif: ParsedNotification, currencySymbol: string): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) return;

  const amountLabel = `${currencySymbol}${notif.amount.toLocaleString()}`;
  const verb = notif.type === 'credit' ? 'received from' : 'paid to';

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483647),
          title: 'New transaction detected',
          body: `${amountLabel} ${verb} ${notif.payeeOrPayer}. Tap to review & add.`,
          smallIcon: 'ic_stat_tmf',
        },
      ],
    });
  } catch (err) {
    console.warn('Failed to post local notification:', err);
  }
}
