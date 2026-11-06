package com.trackmoneyflow.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.location.Location;
import android.location.LocationManager;
import android.location.Geocoder;
import android.location.Address;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public final class InterceptedPaymentStore {
    private static final String PREFS = "tmf_intercepted_payments";
    private static final String CHANNEL = "tmf_payment_review";

    public static synchronized JSONArray read(Context context) throws JSONException {
        return new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("queue", "[]"));
    }

    public static synchronized JSONObject find(Context context, String id) throws JSONException {
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (record.getString("id").equals(id)) return record;
        }
        return null;
    }

    public static synchronized JSONArray pending(Context context) throws JSONException {
        JSONArray records = read(context);
        JSONObject saved = new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("saved", "{}"));
        java.util.Iterator<String> keys = saved.keys();
        while (keys.hasNext()) records.put(saved.getJSONObject(keys.next()));
        return records;
    }

    public static synchronized void acknowledgeSaved(Context context, String id) throws JSONException {
        JSONObject saved = new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("saved", "{}"));
        saved.remove(id);
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("saved", saved.toString()).commit()) {
            throw new IllegalStateException("Could not acknowledge saved payment");
        }
    }

    public static synchronized void completeSave(Context context, String id, JSONObject result) throws JSONException {
        JSONObject record = find(context, id);
        if (record == null) return;
        if (!record.optString("owner").equals(result.getString("owner"))) throw new SecurityException("Payment owner changed");
        if (!result.optBoolean("duplicate")) {
            JSONObject transaction = result.getJSONObject("transaction");
            if (!("tx_native_" + id).equals(transaction.getString("id"))) throw new SecurityException("Payment id changed");
            record.put("transaction", transaction);
            if (result.has("account")) record.put("account", result.getJSONObject("account"));
            if (result.has("localBalance")) record.put("localBalance", result.getDouble("localBalance"));
        }
        JSONObject saved = new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("saved", "{}"));
        long revision = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("savedRevision", 0) + 1;
        record.put("action", "saved").put("savedRevision", revision);
        saved.put(id, record);
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("saved", saved.toString()).putLong("savedRevision", revision).commit()) {
            throw new IllegalStateException("Could not persist saved transaction");
        }
        resolve(context, id);
        record.put("action", "saved");
        NotificationInterceptPlugin.dispatchNotification(record);
    }

    public static synchronized void saveFailed(Context context, String id, String message) throws JSONException {
        JSONObject record = find(context, id);
        if (record == null || !"saving".equals(record.optString("action"))) return;
        record.put("saveError", message == null ? "Could not save payment" : message.substring(0, Math.min(message.length(), 200)));
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            if (id.equals(records.getJSONObject(i).getString("id"))) records.put(i, record);
        }
        save(context, records);
        show(context, record);
    }

    public static synchronized void clear(Context context) throws JSONException {
        JSONArray records = read(context);
        save(context, new JSONArray());
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("saved", "{}").commit()) {
            throw new IllegalStateException("Could not clear saved payment receipts");
        }
        for (int i = 0; i < records.length(); i++) {
            androidx.work.WorkManager.getInstance(context).cancelUniqueWork("minarth-save-" + records.getJSONObject(i).getString("id"));
            ContextCompat.getSystemService(context, NotificationManager.class).cancel(records.getJSONObject(i).getString("id"), 1);
        }
    }

    private static void save(Context context, JSONArray records) {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("queue", records.toString()).commit()) {
            throw new IllegalStateException("Could not persist intercepted payment queue");
        }
    }

    public static synchronized JSONObject capture(Context context, String pkg, String title, String text, long time) throws JSONException {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)) return null;
        String id = UUID.nameUUIDFromBytes((pkg + "|" + title + "|" + text + "|" + time).getBytes(StandardCharsets.UTF_8)).toString();
        JSONObject resolved = new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("resolved", "{}"));
        if (resolved.has(id)) return null;
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            if (id.equals(records.getJSONObject(i).getString("id"))) return null;
        }
        JSONObject record = new JSONObject().put("id", id).put("packageName", pkg)
            .put("title", title).put("text", text).put("postedAt", time).put("action", "review")
            .put("owner", context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("owner", ""));
        Location location = captureLocation(context, time);
        if (location != null) record.put("location", new JSONObject()
            .put("lat", location.getLatitude()).put("lng", location.getLongitude()).put("capturedAt", location.getTime()));
        records.put(record);
        save(context, records);
        show(context, record);
        if (location != null) resolveLocationName(context, id, location);
        return record;
    }

    private static Location captureLocation(Context context, long postedAt) {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("locationTracking", false)
            || Math.abs(System.currentTimeMillis() - postedAt) > 120000L) return null;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null;
        try {
            LocationManager manager = ContextCompat.getSystemService(context, LocationManager.class);
            Location best = null;
            for (String provider : manager.getProviders(true)) {
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate != null && Math.abs(candidate.getTime() - postedAt) <= 120000L
                    && (best == null || candidate.getTime() > best.getTime())) best = candidate;
            }
            return best;
        } catch (SecurityException error) {
            Log.w("TMFInterceptor", "Capture-time location is unavailable; background location is not requested", error);
            return null;
        }
    }

    private static void resolveLocationName(Context context, String id, Location location) {
        new Thread(() -> {
            try {
                String name = readableLocationName(context, location.getLatitude(), location.getLongitude());
                if (name == null || name.trim().isEmpty()) {
                    Log.w("TMFInterceptor", "Capture-time address has no place name; coordinates retained for retry");
                    return;
                }
                synchronized (InterceptedPaymentStore.class) {
                    JSONArray records = read(context);
                    for (int i = 0; i < records.length(); i++) {
                        JSONObject record = records.getJSONObject(i);
                        if (!id.equals(record.getString("id"))) continue;
                        record.getJSONObject("location").put("name", name);
                        save(context, records);
                        NotificationInterceptPlugin.dispatchNotification(record);
                        break;
                    }
                }
            } catch (java.io.IOException | JSONException | IllegalStateException | IllegalArgumentException error) {
                Log.w("TMFInterceptor", "Could not resolve capture-time location", error);
            }
        }, "minarth-payment-geocoder").start();
    }

    public static String readableLocationName(Context context, double lat, double lng) throws java.io.IOException {
        java.util.List<Address> addresses = new Geocoder(context, java.util.Locale.getDefault()).getFromLocation(lat, lng, 1);
        if (addresses == null || addresses.isEmpty()) return null;
        Address address = addresses.get(0);
        String local = address.getSubLocality();
        String city = address.getLocality();
        return local != null && city != null && !local.equalsIgnoreCase(city) ? local + ", " + city
            : city != null ? city : address.getAdminArea();
    }

    public static synchronized void description(Context context, String id, String description) throws JSONException {
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (!id.equals(record.getString("id"))) continue;
            if ("ignore".equals(record.getString("action")) || "saving".equals(record.getString("action"))) return;
            record.put("description", description.substring(0, Math.min(description.length(), 200)).trim());
            save(context, records);
            show(context, record);
            NotificationInterceptPlugin.dispatchNotification(record);
            return;
        }
    }

    public static synchronized void action(Context context, String id, String action) throws JSONException {
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (id.equals(record.getString("id"))) {
                if ("saving".equals(record.optString("action")) && !record.has("saveError") && !"saving".equals(action)) return;
                record.put("action", action);
                record.remove("saveError");
                save(context, records);
                if ("saving".equals(action)) show(context, record);
                NotificationInterceptPlugin.dispatchNotification(record);
                return;
            }
        }
    }

    public static synchronized void resolve(Context context, String id) throws JSONException {
        JSONArray records = read(context);
        JSONArray remaining = new JSONArray();
        JSONObject resolved = new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("resolved", "{}"));
        java.util.Iterator<String> keys = resolved.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (System.currentTimeMillis() - resolved.getLong(key) > 30L * 86400000L) keys.remove();
        }
        resolved.put(id, System.currentTimeMillis());
        for (int i = 0; i < records.length(); i++) {
            if (!id.equals(records.getJSONObject(i).getString("id"))) remaining.put(records.getJSONObject(i));
        }
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("queue", remaining.toString()).putString("resolved", resolved.toString()).commit()) {
            throw new IllegalStateException("Could not persist payment resolution");
        }
        ContextCompat.getSystemService(context, NotificationManager.class).cancel(id, 1);
    }

    public static synchronized void configure(Context context, boolean enabled, boolean notifications, boolean locationTracking, String owner) throws JSONException {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled).putBoolean("notifications", notifications).putBoolean("locationTracking", locationTracking)
            .putString("owner", owner).commit()) {
            throw new IllegalStateException("Could not persist interceptor settings");
        }
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (record.optString("owner").isEmpty() && enabled && !owner.isEmpty()) record.put("owner", owner);
            if (enabled && notifications && !"ignore".equals(record.getString("action"))) show(context, record);
            else ContextCompat.getSystemService(context, NotificationManager.class).cancel(record.getString("id"), 1);
            if (enabled && "saving".equals(record.optString("action"))) PaymentSaveWorker.enqueue(context, record.getString("id"));
        }
        save(context, records);
    }

    private static PendingIntent open(Context context, String id, String action) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) throw new IllegalStateException("No app launch activity");
        intent.setAction("tmf.payment." + id + "." + action);
        intent.putExtra("tmfPaymentId", id).putExtra("tmfPaymentAction", action);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void show(Context context, JSONObject record) throws JSONException {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("notifications", false)) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w("TMFInterceptor", "Payment captured; notification display permission is missing");
            return;
        }
        NotificationManager manager = ContextCompat.getSystemService(context, NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Payment confirmations", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
        String id = record.getString("id");
        boolean saving = "saving".equals(record.optString("action"));
        boolean failed = record.has("saveError");
        Intent add = new Intent(context, PaymentActionReceiver.class).setAction("tmf.add." + id).putExtra("tmfPaymentId", id);
        PendingIntent addIntent = PendingIntent.getBroadcast(context, 0, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent ignore = new Intent(context, PaymentActionReceiver.class).setAction("tmf.ignore." + id).putExtra("tmfPaymentId", id);
        PendingIntent ignoreIntent = PendingIntent.getBroadcast(context, 0, ignore, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PaymentNotificationDetails summary = new PaymentNotificationDetails(record.getString("title"), record.getString("text"), record.getLong("postedAt"));
        String description = record.optString("description", "");
        RemoteViews card = new RemoteViews(context.getPackageName(), R.layout.payment_notification);
        card.setTextViewText(R.id.payment_amount, summary.amount);
        card.setTextViewText(R.id.payment_details, summary.details);
        card.setTextViewText(R.id.payment_description, failed ? "Not saved: " + record.getString("saveError")
            : saving ? "Saving transaction and syncing account balance..." : description.isEmpty() ? "Use Description below to add what this payment was for." : description);
        if (!saving || failed) card.setOnClickPendingIntent(R.id.payment_edit, open(context, id, "edit"));
        Intent reply = new Intent(context, PaymentActionReceiver.class)
            .setAction("tmf.description." + id).putExtra("tmfPaymentId", id);
        PendingIntent replyIntent = PendingIntent.getBroadcast(context, 0, reply,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(0, "Description", replyIntent)
            .addRemoteInput(new RemoteInput.Builder("tmfDescription").setLabel("What was this payment for?").build())
            .setAllowGeneratedReplies(false).setShowsUserInterface(false).build();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_tmf).setContentTitle(failed ? "Payment save needs attention" : saving ? "Saving payment" : "New transaction detected")
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.drawable.ic_minarth_purple))
            .setColor(Color.rgb(126, 58, 210)).setContentText(summary.amount)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle()).setCustomBigContentView(card)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOnlyAlertOnce(true)
            .setContentIntent(open(context, id, "open"));
        if (!saving || failed) {
            builder.addAction(new NotificationCompat.Action.Builder(0, "Add", addIntent).setShowsUserInterface(false).build());
        }
        if (!saving) {
            builder.addAction(replyAction)
                .addAction(new NotificationCompat.Action.Builder(0, "Ignore", ignoreIntent).setShowsUserInterface(false).build());
        }
        manager.notify(id, 1, builder.build());
    }
}
