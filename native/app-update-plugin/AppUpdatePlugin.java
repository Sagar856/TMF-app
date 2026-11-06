package com.trackmoneyflow.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "AppUpdate", permissions = {
    @Permission(alias = "notifications", strings = { android.Manifest.permission.POST_NOTIFICATIONS })
})
public class AppUpdatePlugin extends Plugin {
    private static final String APK_URL = "https://sagar856.github.io/TMF-app/downloads/TMF-app.apk";
    private static final long MAX_SIZE = 150L * 1024 * 1024;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean supported() throws PackageManager.NameNotFoundException {
        return AppUpdateWorker.supported(getContext());
    }

    @Override
    public void load() {
        try {
            AppUpdateWorker.schedule(getContext());
        } catch (PackageManager.NameNotFoundException | IllegalStateException error) {
            android.util.Log.e("MinarthUpdate", "Could not schedule background updates.", error);
        }
    }

    @PluginMethod
    public void startAutomaticChecks(PluginCall call) {
        try {
            if (!supported()) {
                AppUpdateWorker.schedule(getContext());
                JSObject result = new JSObject();
                result.put("notificationsEnabled", false);
                call.resolve(result);
                return;
            }
            android.content.SharedPreferences preferences = getContext().getSharedPreferences("minarth_app_updates", 0);
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED
                && !preferences.getBoolean("permissionAsked", false)) {
                if (!preferences.edit().putBoolean("permissionAsked", true).commit()) {
                    throw new IllegalStateException("Could not save notification permission preference.");
                }
                requestPermissionForAlias("notifications", call, "notificationPermissionResult");
                return;
            }
            notificationPermissionResult(call);
        } catch (PackageManager.NameNotFoundException | IllegalStateException error) {
            call.reject("Could not enable automatic update checks.", error);
        }
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        try {
            AppUpdateWorker.schedule(getContext());
            JSObject result = new JSObject();
            result.put("notificationsEnabled", androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
                && (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED));
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException | IllegalStateException error) {
            call.reject("Could not schedule automatic update checks.", error);
        }
    }

    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("appId", info.packageName);
            result.put("versionName", info.versionName);
            result.put("versionCode", versionCode(info));
            result.put("supported", supported());
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Could not read installed app information.", error);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        executor.execute(() -> {
            File partial = null;
            try {
                if (!supported()) throw new IllegalStateException("This installation uses store-managed updates.");
                String url = call.getString("apkUrl", "");
                String hash = call.getString("sha256", "");
                Integer size = call.getInt("size");
                Integer expectedVersion = call.getInt("versionCode");
                if (!APK_URL.equals(url) || !hash.matches("[a-f0-9]{64}") || size == null
                    || size < 1 || size > MAX_SIZE || expectedVersion == null || expectedVersion < 1 || expectedVersion > 2100000000) {
                    throw new IllegalArgumentException("Invalid update metadata.");
                }
                File directory = new File(getContext().getCacheDir(), "app-updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Could not prepare update storage.");
                File apk = new File(directory, "update.apk");
                partial = new File(directory, "update.part");
                if (!apk.isFile() || apk.length() != size || !hash.equals(sha256(apk))) {
                    download(url, partial, size);
                    if (!hash.equals(sha256(partial))) throw new IllegalStateException("Update checksum did not match. Try downloading again.");
                    if (apk.exists() && !apk.delete()) throw new IllegalStateException("Could not replace cached update.");
                    if (!partial.renameTo(apk)) throw new IllegalStateException("Could not save verified update.");
                }
                verifyPackage(apk, expectedVersion);
                getActivity().runOnUiThread(() -> {
                    try {
                        JSObject result = new JSObject();
                        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName())));
                            result.put("status", "permission-required");
                        } else {
                            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".updates", apk);
                            Intent intent = new Intent(Intent.ACTION_VIEW);
                            intent.setDataAndType(uri, "application/vnd.android.package-archive");
                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            getActivity().startActivity(intent);
                            result.put("status", "installer-opened");
                        }
                        call.resolve(result);
                    } catch (RuntimeException error) {
                        call.reject("Could not open Android update settings or installer.", error);
                    }
                });
            } catch (Exception error) {
                call.reject(error.getMessage() != null ? error.getMessage() : "Could not download or verify the update.", error);
            } finally {
                if (partial != null && partial.exists() && !partial.delete()) {
                    android.util.Log.w("MinarthUpdate", "Could not remove partial update file.");
                }
            }
        });
    }

    private void download(String url, File file, long expectedSize) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url + "?t=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("The update download failed. Please try again.");
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
                byte[] buffer = new byte[32768];
                long total = 0;
                long deadline = android.os.SystemClock.elapsedRealtime() + 300000;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted() || android.os.SystemClock.elapsedRealtime() > deadline) {
                        throw new IllegalStateException("The update download timed out. Please try again.");
                    }
                    total += count;
                    if (total > expectedSize || total > MAX_SIZE) throw new IllegalStateException("The update exceeds its declared size.");
                    output.write(buffer, 0, count);
                }
                if (total != expectedSize) throw new IllegalStateException("The update download is incomplete.");
            }
        } finally {
            connection.disconnect();
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32768];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    private void verifyPackage(File apk, long expectedVersion) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo current = manager.getPackageInfo(getContext().getPackageName(), flags);
        PackageInfo candidate = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (candidate == null || !current.packageName.equals(candidate.packageName)
            || versionCode(candidate) != expectedVersion || expectedVersion <= versionCode(current)) {
            throw new IllegalStateException("This APK is not a newer version of MINARTH.");
        }
        Signature[] installed = signatures(current);
        Signature[] downloaded = signatures(candidate);
        if (installed == null || downloaded == null || installed.length == 0 || installed.length != downloaded.length) {
            throw new IllegalStateException("The update signing certificate does not match this installation. Do not uninstall; contact support.");
        }
        for (Signature signer : installed) {
            if (!Arrays.asList(downloaded).contains(signer)) {
                throw new IllegalStateException("The update signing certificate does not match this installation. Do not uninstall; contact support.");
            }
        }
    }

    private Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28) return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        return info.signatures;
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
    }
}
