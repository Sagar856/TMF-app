package com.trackmoneyflow.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Notification-only summary; the original message is preserved for the authoritative JS parser. */
public final class PaymentNotificationDetails {
    public final String amount;
    public final String details;
    public PaymentNotificationDetails(String title, String text, long postedAt) {
        String currency = match(text, "((?:INR|Rs\\.?|\\u20B9|USD|EUR|GBP|\\$|\\u20AC|\\u00A3)\\s*[\\d,]+(?:\\.\\d{1,2})?)", 1);
        currency = currency.replaceFirst("(?i)^(?:INR|Rs\\.?)\\s*", "\u20B9");
        boolean credit = Pattern.compile("\\b(?:credited|received|deposited|refunded)\\b", Pattern.CASE_INSENSITIVE).matcher(text).find();
        boolean debit = Pattern.compile("\\b(?:debited|spent|paid|withdrawn|deducted)\\b", Pattern.CASE_INSENSITIVE).matcher(text).find();
        amount = (currency.isEmpty() ? "Payment" : currency) + (credit ? "  Credit" : debit ? "  Debit" : "");
        String account = match(text, "(?:a/c(?:\\s*no\\.?)?|acct?|account)(?:\\s*(?:no\\.?|number))?\\s*[:.]?\\s*([Xx*\\d-]{4,})", 1);
        String merchant = match(text, "UPI/(?:P2A|P2P)/[\\d]+/([^\\n]+)", 1);
        if (merchant.isEmpty()) merchant = match(text, "\\b(?:to|from|at)\\s+([^\\n.;]+)", 1);
        merchant = merchant.split("(?i)(?:\\s+(?:not you|avl|available|balance|if you|for queries|call us)\\b|\\.\\s+|;)", 2)[0].trim();
        if (Pattern.compile("^(?:a/c|acct?|account|your account)\\b", Pattern.CASE_INSENSITIVE).matcher(merchant).find()) merchant = "";
        if (merchant.length() > 60) merchant = merchant.substring(0, 60);
        String bank = match(title + " " + text, "\\b(Axis Bank|HDFC Bank|ICICI Bank|SBI|Kotak|PNB|Bank of Baroda|Canara Bank|IDFC|IndusInd|Federal Bank)\\b", 1);
        if (bank.isEmpty()) bank = title;
        String mode = Pattern.compile("\\bUPI\\b", Pattern.CASE_INSENSITIVE).matcher(text).find() ? "UPI" : "Bank payment";
        String date = match(text, "(\\d{2}[-/]\\d{2}[-/]\\d{2,4}[, ]+\\d{2}:\\d{2}(?::\\d{2})?)", 1);
        if (date.isEmpty()) date = new SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(new Date(postedAt));
        details = "Account  " + (account.isEmpty() ? "Review in app" : account)
            + "\nDate & time  " + date + "\nMode  " + mode
            + "\n" + (credit ? "From" : debit ? "To / merchant" : "Merchant") + "  " + (merchant.isEmpty() ? "Review in app" : merchant)
            + "\nBank  " + bank;
    }
    private static String match(String value, String regex, int group) {
        Matcher matcher = Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(value);
        return matcher.find() ? matcher.group(group).trim() : "";
    }
}
