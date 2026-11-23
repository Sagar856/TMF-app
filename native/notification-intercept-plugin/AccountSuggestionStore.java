package com.trackmoneyflow.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class AccountSuggestionStore {
    private static final String PREFS = "tmf_account_suggestions";
    private static final String CHANNEL = "tmf_account_review";
    private static final Pattern ACCOUNT = Pattern.compile(
        "(?:a/c|account|acct|card|ac)\\s*(?:no\\.?|number|ending(?:\\s+in)?)?[\\s:.#-]*[xX*nN]*(\\d{4,})(?!\\d)",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern ENDING = Pattern.compile("\\bending(?:\\s+in)?\\s*(\\d{4})(?!\\d)", Pattern.CASE_INSENSITIVE);

    private static JSONObject read(Context context) throws JSONException {
        return new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("records", "{}"));
    }

    private static void write(Context context, JSONObject records) {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("records", records.toString()).commit()) {
            throw new IllegalStateException("Could not save account suggestions");
        }
    }

    private static String key(String owner, String last4) {
        return UUID.nameUUIDFromBytes((owner + ":" + last4).getBytes(StandardCharsets.UTF_8)).toString();
    }

    private static String last4(String text) {
        Matcher match = ACCOUNT.matcher(text);
        if (!match.find()) {
            match = ENDING.matcher(text);
            if (!match.find()) return "";
        }
        String digits = match.group(1);
        return digits.substring(digits.length() - 4);
    }

    public static synchronized void capture(Context context, String owner, JSONArray known, JSONArray ignored, String text, boolean notifications) throws JSONException {
        if (owner.isEmpty()) return;
        String suffix = last4(text);
        if (suffix.isEmpty()) return;
        for (int i = 0; i < known.length(); i++) if (suffix.equals(known.optString(i))) return;
        for (int i = 0; i < ignored.length(); i++) if (suffix.equals(ignored.optString(i))) return;
        JSONObject records = read(context);
        String id = key(owner, suffix);
        if (records.has(id)) return;
        JSONObject record = new JSONObject().put("id", id).put("owner", owner).put("last4", suffix)
            .put("type", Pattern.compile("\\bcredit\\s*card\\b", Pattern.CASE_INSENSITIVE).matcher(text).find() ? "Credit Card" : "Bank")
            .put("action", "review");
        records.put(id, record);
        write(context, records);
        if (notifications) show(context, record);
    }

    public static synchronized void configure(Context context, String owner, JSONArray known, JSONArray ignored, boolean enabled) throws JSONException {
        JSONObject records = read(context);
        JSONArray ids = records.names();
        if (ids == null) return;
        NotificationManager manager = ContextCompat.getSystemService(context, NotificationManager.class);
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.getString(i);
            JSONObject record = records.getJSONObject(id);
            boolean owns = owner.equals(record.optString("owner"));
            boolean exists = false;
            boolean suppressed = false;
            if (owns) for (int j = 0; j < known.length(); j++) {
                if (record.optString("last4").equals(known.optString(j))) exists = true;
            }
            if (owns) for (int j = 0; j < ignored.length(); j++) {
                if (record.optString("last4").equals(ignored.optString(j))) suppressed = true;
            }
            if (exists) records.remove(id);
            if (enabled && owns && !exists && !suppressed && !"ignored".equals(record.optString("action"))) show(context, record);
            else manager.cancel("account:" + id, 3);
        }
        write(context, records);
    }

    public static synchronized JSONArray actions(Context context, String owner) throws JSONException {
        JSONObject records = read(context);
        JSONArray result = new JSONArray();
        JSONArray ids = records.names();
        if (ids != null) for (int i = 0; i < ids.length(); i++) {
            JSONObject record = records.getJSONObject(ids.getString(i));
            if (owner.equals(record.optString("owner"))
                && ("open".equals(record.optString("action"))
                    || ("ignored".equals(record.optString("action")) && !record.optBoolean("delivered")))) result.put(record);
        }
        return result;
    }

    public static synchronized void action(Context context, String id, String owner, String action) throws JSONException {
        JSONObject records = read(context);
        JSONObject record = records.optJSONObject(id);
        if (owner == null || record == null || !owner.equals(record.optString("owner")) || owner.isEmpty()
            || !owner.equals(context.getSharedPreferences("tmf_intercepted_payments", Context.MODE_PRIVATE).getString("owner", ""))) return;
        if ("open".equals(action) && "ignored".equals(record.optString("action"))) return;
        record.put("action", action);
        if ("ignored".equals(action)) record.put("delivered", false);
        write(context, records);
        if ("ignored".equals(action)) ContextCompat.getSystemService(context, NotificationManager.class).cancel("account:" + id, 3);
        NotificationInterceptPlugin.dispatchAccountSuggestion(record);
    }

    public static synchronized void acknowledge(Context context, String id, String owner) throws JSONException {
        JSONObject records = read(context);
        JSONObject record = records.optJSONObject(id);
        if (record == null || !owner.equals(record.optString("owner"))) return;
        if ("ignored".equals(record.optString("action"))) record.put("delivered", true);
        else record.put("action", "review");
        write(context, records);
    }

    public static synchronized void clear(Context context) throws JSONException {
        JSONObject records = read(context);
        JSONArray ids = records.names();
        if (ids != null) for (int i = 0; i < ids.length(); i++) {
            ContextCompat.getSystemService(context, NotificationManager.class).cancel("account:" + ids.getString(i), 3);
        }
        write(context, new JSONObject());
    }

    private static PendingIntent open(Context context, JSONObject record, String action) throws JSONException {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) throw new IllegalStateException("No app launch activity");
        String id = record.getString("id");
        intent.setAction("tmf.account." + id + "." + action);
        intent.putExtra("tmfAccountId", id).putExtra("tmfAccountOwner", record.getString("owner"));
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void show(Context context, JSONObject record) throws JSONException {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = ContextCompat.getSystemService(context, NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Account suggestions", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
        String id = record.getString("id");
        Intent ignore = new Intent(context, PaymentActionReceiver.class).setAction("tmf.account.ignore." + id)
            .putExtra("tmfAccountId", id).putExtra("tmfAccountOwner", record.getString("owner"));
        PendingIntent ignoreIntent = PendingIntent.getBroadcast(context, 0, ignore, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_tmf).setContentTitle("Account not recognized")
            .setContentText("Review account ending " + record.getString("last4") + " before adding it.")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOnlyAlertOnce(true).setAutoCancel(false)
            .setContentIntent(open(context, record, "open"))
            .addAction(0, "Add", open(context, record, "add"))
            .addAction(0, "Edit", open(context, record, "edit"))
            .addAction(0, "Ignore", ignoreIntent).build();
        manager.notify("account:" + id, 3, notification);
    }
}
