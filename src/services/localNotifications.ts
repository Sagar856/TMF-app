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

/**
 * Posts a push-style notification when monthly category spend crosses 80% or 100% budget limit.
 */
export async function notifyBudgetThresholdReached(
  categoryName: string,
  spent: number,
  limit: number,
  percent: number,
  currencySymbol: string,
  level: '80' | '100',
  monthLabel?: string
): Promise<void> {
  const isWeb = Capacitor.getPlatform() === 'web';
  const title = level === '100'
    ? `🚨 100% Budget Exceeded: ${categoryName}`
    : `⚠️ 80% Budget Alert: ${categoryName}`;

  const remaining = Math.max(0, limit - spent);
  const body = level === '100'
    ? `You have exceeded your ${currencySymbol}${limit.toLocaleString()} monthly budget for ${categoryName} (Spent: ${currencySymbol}${spent.toLocaleString()} / ${percent.toFixed(0)}%).`
    : `You have used ${percent.toFixed(0)}% of your ${categoryName} budget (${currencySymbol}${spent.toLocaleString()} of ${currencySymbol}${limit.toLocaleString()}). ${currencySymbol}${remaining.toLocaleString()} left.`;

  // 1. Mobile Native Local Notifications (Capacitor)
  if (!isWeb) {
    const granted = await ensurePermission();
    if (granted) {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 2147483647),
              title,
              body,
              smallIcon: 'ic_stat_tmf',
            },
          ],
        });
      } catch (err) {
        console.warn('Failed to post local budget notification:', err);
      }
    }
  }

  // 2. Web Browser Notification API fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title, {
              body,
              icon: '/favicon.ico',
            });
          }
        }).catch(() => {});
      }
    } catch {
      // Ignore web notification errors in sandboxed environments
    }
  }
}

