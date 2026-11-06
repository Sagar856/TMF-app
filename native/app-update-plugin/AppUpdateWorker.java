package com.trackmoneyflow.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONException;
import org.json.JSONObject;

public final class AppUpdateWorker extends Worker {
    private static final String PERIODIC = "minarth-periodic-update-check";
    private static final String IMMEDIATE = "minarth-update-check";
    private static final String CHANNEL = "minarth_app_updates";
    private static final String PREFS = "minarth_app_updates";
    private static final String METADATA_URL = "https://sagar856.github.io/TMF-app/downloads/update.json";
    private static final String APK_URL = "https://sagar856.github.io/TMF-app/downloads/TMF-app.apk";

    public AppUpdateWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    static boolean supported(Context context) throws PackageManager.NameNotFoundException {
        PackageManager manager = context.getPackageManager();
        ApplicationInfo info = manager.getApplicationInfo(context.getPackageName(), PackageManager.GET_META_DATA);
        return info.metaData != null && info.metaData.getBoolean("minarth.sideloadUpdates", false)
            && !"com.android.vending".equals(manager.getInstallerPackageName(context.getPackageName()));
    }

    static void schedule(Context context) throws PackageManager.NameNotFoundException {
        WorkManager manager = WorkManager.getInstance(context);
        if (!supported(context)) {
            manager.cancelUniqueWork(PERIODIC);
            manager.cancelUniqueWork(IMMEDIATE);
            return;
        }
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        manager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(AppUpdateWorker.class, 12, TimeUnit.HOURS)
                .setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build());
        manager.enqueueUniqueWork(IMMEDIATE, ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(AppUpdateWorker.class).setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build());
    }

    @NonNull
    @Override
    public Result doWork() {
        synchronized (AppUpdateWorker.class) {
            return check();
        }
    }

    private Result check() {
        Context context = getApplicationContext();
        try {
            if (!supported(context)) return Result.success();
            JSONObject update = fetchMetadata();
            long code = validatedVersion(update, context.getPackageName());
            PackageInfo installed = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long installedCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
            if (code <= installedCode) {
                NotificationManagerCompat.from(context).cancel(7241);
                return Result.success();
            }
            if (context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("notifiedVersion", 0) >= code) return Result.success();
            if ((Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
                Log.w("MinarthUpdate", "Update available, but Android notifications are disabled. In-app checks remain available.");
                return Result.success();
            }
            NotificationManager manager = ContextCompat.getSystemService(context, NotificationManager.class);
            if (manager == null) throw new IllegalStateException("Android notification service is unavailable.");
            if (Build.VERSION.SDK_INT >= 26) {
                manager.createNotificationChannel(new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
                if (manager.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) {
                    Log.w("MinarthUpdate", "Update notification channel is disabled.");
                    return Result.success();
                }
            }
            Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intent == null) throw new IllegalStateException("No app launch activity for the update notification.");
            intent.setAction("minarth.update.available");
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent open = PendingIntent.getActivity(context, 7241, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            manager.notify(7241, new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_tmf).setContentTitle("MINARTH update available")
                .setContentText("Version " + update.getString("versionName") + " is ready. Tap to review and install.")
                .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build());
            if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("notifiedVersion", code).commit()) {
                throw new IllegalStateException("Could not save update notification history.");
            }
            return Result.success();
        } catch (IOException error) {
            Log.w("MinarthUpdate", "Background update download failed.", error);
            return getRunAttemptCount() < 3 ? Result.retry() : Result.failure();
        } catch (JSONException | PackageManager.NameNotFoundException | IllegalArgumentException | IllegalStateException | SecurityException error) {
            Log.e("MinarthUpdate", "Background update check failed.", error);
            return Result.failure();
        }
    }

    static long validatedVersion(JSONObject update, String appId) throws JSONException {
        Object rawCode = update.get("versionCode");
        Object rawSize = update.get("size");
        if (!(rawCode instanceof Integer || rawCode instanceof Long) || !(rawSize instanceof Integer || rawSize instanceof Long)) {
            throw new IllegalArgumentException("Update build and size must be integers.");
        }
        long code = ((Number) rawCode).longValue();
        long size = ((Number) rawSize).longValue();
        if (update.getInt("schemaVersion") != 1 || !appId.equals(update.getString("appId"))
            || !APK_URL.equals(update.getString("apkUrl")) || code < 1 || code > 2100000000L
            || size < 1 || size > 150L * 1024 * 1024
            || !update.getString("sha256").matches("[a-f0-9]{64}")
            || !update.getString("versionName").matches("\\d+\\.\\d+\\.\\d+(?:[-+][a-zA-Z0-9.-]+)?")) {
            throw new IllegalArgumentException("Invalid or untrusted update metadata.");
        }
        return code;
    }

    private JSONObject fetchMetadata() throws IOException, JSONException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(METADATA_URL + "?t=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Update metadata HTTP " + connection.getResponseCode());
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                long deadline = android.os.SystemClock.elapsedRealtime() + 30000;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (isStopped() || output.size() + count > 32768 || android.os.SystemClock.elapsedRealtime() > deadline) {
                        throw new IOException("Update metadata exceeded its size or time limit.");
                    }
                    output.write(buffer, 0, count);
                }
                return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally {
            connection.disconnect();
        }
    }
}
