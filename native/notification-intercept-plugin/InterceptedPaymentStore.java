package com.trackmoneyflow.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
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

    public static synchronized void clear(Context context) throws JSONException {
        JSONArray records = read(context);
        save(context, new JSONArray());
        for (int i = 0; i < records.length(); i++) {
            context.getSystemService(NotificationManager.class).cancel(records.getJSONObject(i).getString("id"), 1);
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
            .put("title", title).put("text", text).put("postedAt", time).put("action", "review");
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
        if (context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null;
        try {
            LocationManager manager = context.getSystemService(LocationManager.class);
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
                java.util.List<Address> addresses = new Geocoder(context, java.util.Locale.getDefault())
                    .getFromLocation(location.getLatitude(), location.getLongitude(), 1);
                if (addresses == null || addresses.isEmpty()) {
                    Log.w("TMFInterceptor", "No readable capture-time address; coordinates retained for retry");
                    return;
                }
                Address address = addresses.get(0);
                String local = address.getSubLocality();
                String city = address.getLocality();
                String name = local != null && city != null && !local.equalsIgnoreCase(city) ? local + ", " + city
                    : city != null ? city : address.getAdminArea();
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

    public static synchronized void description(Context context, String id, String description) throws JSONException {
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (!id.equals(record.getString("id"))) continue;
            if ("ignore".equals(record.getString("action"))) return;
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
                record.put("action", action);
                save(context, records);
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
        context.getSystemService(NotificationManager.class).cancel(id, 1);
    }

    public static synchronized void configure(Context context, boolean enabled, boolean notifications, boolean locationTracking) throws JSONException {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled).putBoolean("notifications", notifications).putBoolean("locationTracking", locationTracking).commit()) {
            throw new IllegalStateException("Could not persist interceptor settings");
        }
        JSONArray records = read(context);
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i);
            if (enabled && notifications && !"ignore".equals(record.getString("action"))) show(context, record);
            else context.getSystemService(NotificationManager.class).cancel(record.getString("id"), 1);
        }
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
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w("TMFInterceptor", "Payment captured; notification display permission is missing");
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Payment confirmations", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
        String id = record.getString("id");
        Intent ignore = new Intent(context, PaymentActionReceiver.class).setAction("tmf.ignore." + id).putExtra("tmfPaymentId", id);
        PendingIntent ignoreIntent = PendingIntent.getBroadcast(context, 0, ignore, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PaymentNotificationDetails summary = new PaymentNotificationDetails(record.getString("title"), record.getString("text"), record.getLong("postedAt"));
        String description = record.optString("description", "");
        RemoteViews card = new RemoteViews(context.getPackageName(), R.layout.payment_notification);
        card.setTextViewText(R.id.payment_amount, summary.amount);
        card.setTextViewText(R.id.payment_details, summary.details);
        card.setTextViewText(R.id.payment_description, description.isEmpty() ? "Use Description below to add what this payment was for." : description);
        card.setOnClickPendingIntent(R.id.payment_edit, open(context, id, "edit"));
        Intent reply = new Intent(context, PaymentActionReceiver.class)
            .setAction("tmf.description." + id).putExtra("tmfPaymentId", id);
        PendingIntent replyIntent = PendingIntent.getBroadcast(context, 0, reply,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        Notification.Action replyAction = new Notification.Action.Builder(null, "Description", replyIntent)
            .addRemoteInput(new RemoteInput.Builder("tmfDescription").setLabel("What was this payment for?").build())
            .setAllowGeneratedReplies(false).build();
        Notification notification = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_tmf).setContentTitle("New transaction detected")
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.drawable.ic_minarth_purple))
            .setColor(Color.rgb(126, 58, 210)).setContentText(summary.amount)
            .setStyle(new Notification.DecoratedCustomViewStyle()).setCustomBigContentView(card)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true)
            .setContentIntent(open(context, id, "open"))
            .addAction(new Notification.Action.Builder(null, "Add", open(context, id, "add")).build())
            .addAction(replyAction)
            .addAction(new Notification.Action.Builder(null, "Ignore", ignoreIntent).build())
            .build();
        manager.notify(id, 1, notification);
    }
}
