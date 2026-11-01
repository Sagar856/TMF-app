package com.trackmoneyflow.app;

import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class TransactionEligibility {
    private static final String[] PAYMENTS = {
        "com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm",
        "com.dreamplug.androidapp", "in.org.npci.upiapp", "com.epifi.fi.money",
        "money.jupiter", "com.sliceit", "com.navi.app", "com.mobikwik",
        "com.csam.icici.bank.imobile", "com.snapwork.hdfc", "com.sbi.lotusintouch",
        "com.sbi.yonobusiness", "com.axis.mobile", "com.msf.kof", "com.pnb.mobile",
        "com.bankofbaroda.mconnect", "com.canarabank.mob", "com.idfcfirstbank.mobile",
        "com.indusind.mobile", "com.fedmobile"
    };
    private static final String[] SMS = {
        "com.android.mms", "com.google.android.apps.messaging", "com.samsung.android.messaging",
        "com.oneplus.mms", "com.miui.smsextra", "com.oppo.mms", "com.vivo.mms", "com.truecaller"
    };
    private static final Pattern BANK = pattern("\\b(?:[a-z]{2}-)?(?:hdfc(?:bk|bank)?|icici(?:b|bank)?|sbi(?:inb|bnk|bank)?|axis(?:bk|bank)?|kotak(?:b|bank)?|pnb(?:sms|bank)?|bob(?:txn|sms|bank)?|can(?:bnk|bank)|idfc(?:fb|bank)?|indus(?:b|ind|bank)|fed(?:bnk|bank)|union(?:b|bank)|yes(?:bnk|bank)|aubank|rbl(?:bnk|bank))\\b");
    private static final Pattern REJECT = pattern("\\b(?:otp|one.time.password|verification.code|offer|offers|promo(?:tional)?|discount|coupon|cashback.up.to|earn.cashback|win|reward.points|pre.approved|apply.now|eligible|reminder|due.date|payment.due|collect.request|payment.request|request(?:ed)?.(?:money|payment)|mandate.(?:created|registered)|scheduled|will.be.(?:debited|credited)|to.be.(?:debited|credited)|failed|declined|unsuccessful|pending|processing)\\b");
    private static final Pattern COMPLETED = pattern("\\b(?:debited|credited|paid|sent|received|spent|withdrawn|transferred|deducted|deposited|refunded|reversed)\\b|\\b(?:payment|transaction|refund)\\s+(?:of\\s+(?:rs\\.?|inr|₹)\\s*[\\d,.]+\\s+)?(?:successful|completed|processed)\\b");
    private static final Pattern AMOUNT = pattern("(?:rs\\.?|inr|₹|\\$|usd|€|eur|£|gbp)\\s*([\\d,]+(?:\\.\\d{1,2})?)|([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:rs\\.?|inr|usd|eur|gbp)");

    private static Pattern pattern(String value) {
        return Pattern.compile(value, Pattern.CASE_INSENSITIVE);
    }

    public static boolean accepts(String packageName, String title, String text) {
        String combined = title + " " + text;
        Matcher amount = AMOUNT.matcher(combined);
        if (!amount.find() || REJECT.matcher(combined).find() || !COMPLETED.matcher(combined).find()) return false;
        String value = amount.group(1) != null ? amount.group(1) : amount.group(2);
        value = value.replace(",", "");
        if (value.isEmpty()) return false;
        double numeric = Double.parseDouble(value);
        if (Double.isInfinite(numeric) || numeric <= 0) return false;
        return Arrays.asList(PAYMENTS).contains(packageName)
            || (Arrays.asList(SMS).contains(packageName) && BANK.matcher(title).find());
    }
}
