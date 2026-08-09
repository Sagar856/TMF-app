import { ParsedNotification, LocationTag, Transaction } from '../types/finance';
import { parseNotification } from './notification/ParserManager';

export function parseSmsNotification(
  text: string,
  userLocation?: LocationTag | null,
  existingTransactions: Transaction[] = [],
  pendingNotifications: ParsedNotification[] = []
): ParsedNotification {
  const result = parseNotification(text, userLocation, existingTransactions, pendingNotifications);
  return result.parsed;
}
