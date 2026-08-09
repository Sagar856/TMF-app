import { ParsedNotification, Transaction, LocationTag } from '../../types/finance';
import { ParseResult } from './ParserTypes';
import { extractWithRegex } from './RegexParser';
import { extractWithKeywords } from './KeywordParser';
import { parseBankTemplate } from './BankTemplateParser';
import { parseUPIFormat } from './UPIParser';
import { parseWalletFormat } from './WalletParser';
import { classifyMerchant } from './CategoryClassifier';
import { isDuplicateNotification } from './DuplicateDetector';
import { computeConfidenceScore } from './ConfidenceScorer';

export function parseNotification(
  text: string,
  userLocation?: LocationTag | null,
  existingTransactions: Transaction[] = [],
  pendingNotifications: ParsedNotification[] = []
): ParseResult {
  const rawText = text.trim();
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5); // "14:15"
  const dateStr = now.toISOString().slice(0, 10); // "2026-08-09"

  // Step 1: Regex Extraction (amount, currency, accountLast4, refNumber, availableBalance)
  const regexResult = extractWithRegex(rawText);

  // Step 2: Keyword Direction & Payment Method Extraction
  const keywordResult = extractWithKeywords(rawText);

  // Step 3: Bank Template Matching
  const bankResult = parseBankTemplate(rawText);

  // Step 4: UPI App Parsing
  const upiResult = parseUPIFormat(rawText);

  // Step 5: Wallet Parsing
  const walletResult = parseWalletFormat(rawText);

  // Determine Final App Source
  let appSource = 'SMS Interceptor';
  if (upiResult.matched) {
    appSource = upiResult.appSource;
  } else if (walletResult.isWallet && walletResult.walletName) {
    appSource = walletResult.walletName;
  } else if (bankResult.matched) {
    appSource = bankResult.bankName;
  }

  // Determine Payee / Merchant Name
  let payeeOrPayer = 'Unknown Merchant';
  if (upiResult.payeeOrPayer) {
    payeeOrPayer = upiResult.payeeOrPayer;
  } else if (bankResult.payeeOrPayer) {
    payeeOrPayer = bankResult.payeeOrPayer;
  } else if (walletResult.payeeOrPayer) {
    payeeOrPayer = walletResult.payeeOrPayer;
  }

  // Fallback to merchant search in rawText if still unknown
  if (payeeOrPayer === 'Unknown Merchant') {
    const fallbackCategory = classifyMerchant('Unknown', rawText, keywordResult.type);
    if (fallbackCategory.subcategory !== 'General Expense' && fallbackCategory.subcategory !== 'Other Income') {
      payeeOrPayer = fallbackCategory.subcategory;
    }
  }

  // Account last 4
  const accountLast4 = bankResult.accountLast4 || regexResult.accountLast4;

  // Reference Number / UTR
  const refNumber = upiResult.upiRefNumber || regexResult.refNumber;

  // Step 6: Categorization
  const categoryMatch = classifyMerchant(payeeOrPayer, rawText, keywordResult.type);

  // Step 7: Duplicate Check
  const isDuplicate = isDuplicateNotification(
    rawText,
    regexResult.amount,
    payeeOrPayer,
    refNumber,
    existingTransactions,
    pendingNotifications
  );

  // Step 8: Confidence Scoring
  const confidence = computeConfidenceScore(
    regexResult.amount,
    payeeOrPayer,
    keywordResult.type,
    accountLast4,
    refNumber
  );

  const defaultLocation: LocationTag = userLocation || {
    lat: 19.076,
    lng: 72.8777,
    name: 'Current Location',
  };

  const parsed: ParsedNotification = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    rawText,
    amount: regexResult.amount,
    payeeOrPayer,
    type: keywordResult.type,
    date: dateStr,
    time: timeStr,
    category: categoryMatch.category,
    subcategory: categoryMatch.subcategory,
    location: defaultLocation,
    appSource,
    status: 'pending',
    accountLast4,
    refNumber,
    availableBalance: regexResult.availableBalance,
    paymentMethod: keywordResult.paymentMethod,
    confidenceScore: confidence.score,
    requiresManualVerification: confidence.requiresManualVerification,
  };

  return {
    parsed,
    confidenceScore: confidence.score,
    isDuplicate,
    requiresManualVerification: confidence.requiresManualVerification,
  };
}
