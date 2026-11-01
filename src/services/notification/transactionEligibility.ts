export const PAYMENT_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm',
  'com.dreamplug.androidapp', 'in.org.npci.upiapp', 'com.epifi.fi.money',
  'money.jupiter', 'com.sliceit', 'com.navi.app', 'com.mobikwik',
  'com.csam.icici.bank.imobile', 'com.snapwork.hdfc', 'com.sbi.lotusintouch',
  'com.sbi.yonobusiness', 'com.axis.mobile', 'com.msf.kof', 'com.pnb.mobile',
  'com.bankofbaroda.mconnect', 'com.canarabank.mob', 'com.idfcfirstbank.mobile',
  'com.indusind.mobile', 'com.fedmobile',
] as const;

export const SMS_PACKAGES = [
  'com.android.mms', 'com.google.android.apps.messaging', 'com.samsung.android.messaging',
  'com.oneplus.mms', 'com.miui.smsextra', 'com.oppo.mms', 'com.vivo.mms', 'com.truecaller',
] as const;

// Mirrored in native TransactionEligibility.java; both run the same fixtures.
const BANK_SENDER = /\b(?:[a-z]{2}-)?(?:hdfc(?:bk|bank)?|icici(?:b|bank)?|sbi(?:inb|bnk|bank)?|axis(?:bk|bank)?|kotak(?:b|bank)?|pnb(?:sms|bank)?|bob(?:txn|sms|bank)?|can(?:bnk|bank)|idfc(?:fb|bank)?|indus(?:b|ind|bank)|fed(?:bnk|bank)|union(?:b|bank)|yes(?:bnk|bank)|aubank|rbl(?:bnk|bank))\b/i;
const NON_PAYMENT = /\b(?:otp|one.time.password|verification.code|offer|offers|promo(?:tional)?|discount|coupon|cashback.up.to|earn.cashback|win|reward.points|pre.approved|apply.now|eligible|reminder|due.date|payment.due|collect.request|payment.request|request(?:ed)?.(?:money|payment)|mandate.(?:created|registered)|scheduled|will.be.(?:debited|credited)|to.be.(?:debited|credited)|failed|declined|unsuccessful|pending|processing)\b/i;
const COMPLETED = /\b(?:debited|credited|paid|sent|received|spent|withdrawn|transferred|deducted|deposited|refunded|reversed)\b|\b(?:payment|transaction|refund)\s+(?:of\s+(?:rs\.?|inr|₹)\s*[\d,.]+\s+)?(?:successful|completed|processed)\b/i;
const AMOUNT = /(?:rs\.?|inr|₹|\$|usd|€|eur|£|gbp)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|usd|eur|gbp)/i;

export function isCompletedPaymentText(text: string): boolean {
  const amount = AMOUNT.exec(text);
  const value = amount ? Number((amount[1] || amount[2]).replace(/,/g, '')) : 0;
  return Boolean(amount && Number.isFinite(value) && value > 0
    && COMPLETED.test(text) && !NON_PAYMENT.test(text));
}

export function isEligiblePaymentNotification(packageName: string, title: string, text: string): boolean {
  if (!isCompletedPaymentText(`${title} ${text}`)) return false;
  if (PAYMENT_PACKAGES.some(pkg => pkg === packageName)) return true;
  return SMS_PACKAGES.some(pkg => pkg === packageName) && BANK_SENDER.test(title);
}
