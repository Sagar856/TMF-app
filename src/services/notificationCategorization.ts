import type { Category, ParsedNotification } from '../types/finance';
import { isCashWithdrawalNotification, matchNotificationCategoryText } from '../utils/paymentTransaction';

export async function categorizeNotification(
  notification: ParsedNotification, categories: Category[],
): Promise<ParsedNotification> {
  if (isCashWithdrawalNotification(notification)) return notification;
  const explicit = notification.categoryOverride?.trim();
  const text = explicit || notification.description?.trim();
  if (!text) return notification;
  const match = matchNotificationCategoryText(text, notification.type, categories);
  if (match.status === 'match') {
    return { ...notification, category: match.category.name, subcategory: match.subcategory };
  }
  return notification;
}
