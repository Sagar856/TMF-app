import { TransactionType, LocationTag, ParsedNotification } from '../../types/finance';

export interface ExtractedData {
  amount: number;
  currency: string;
  type: TransactionType;
  payeeOrPayer: string;
  bankName?: string;
  appSource: string;
  accountLast4?: string;
  refNumber?: string;
  availableBalance?: number;
  paymentMethod?: string;
  dateStr: string;
  timeStr: string;
  matchedTemplate?: string;
  rawText: string;
}

export interface ParseResult {
  parsed: ParsedNotification;
  confidenceScore: number; // 0 - 100
  isDuplicate: boolean;
  requiresManualVerification: boolean;
}
