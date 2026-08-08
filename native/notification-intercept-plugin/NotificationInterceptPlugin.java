package com.trackmoneyflow.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS <-> native bridge for the on-device notification interceptor.
 *
 * Exposes:
 *  - isPermissionGranted(): whether the user has granted "Notification Access"
 *    to this app (required for NotificationListenerService to receive events).
 *  - requestPermission(): opens the system settings screen for the user to
 *    grant that permission (there is no runtime prompt for this permission —
 *    it must be toggled manually in Settings).
 *
 * Emits:
 *  - "notificationReceived" whenever TmfNotificationListenerService observes
 *    a new system notification, with { packageName, title, text, postedAt }.
 */
@CapacitorPlugin(name = "NotificationIntercept")
public class NotificationInterceptPlugin extends Plugin {

    // Static reference so the (non-Activity) NotificationListenerService can
    // forward events to this plugin instance without needing a bind/IPC hop.
    private static NotificationInterceptPlugin activeInstance;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isNotificationAccessGranted(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Called by TmfNotificationListenerService for every relevant notification. */
    public static void dispatchNotification(String packageName, String title, String text, long postedAt) {
        if (activeInstance == null) return;

        JSObject data = new JSObject();
        data.put("packageName", packageName == null ? "" : packageName);
        data.put("title", title == null ? "" : title);
        data.put("text", text == null ? "" : text);
        data.put("postedAt", postedAt);
        activeInstance.notifyListeners("notificationReceived", data);
    }

    private static boolean isNotificationAccessGranted(Context context) {
        String enabledListeners = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(enabledListeners)) return false;

        ComponentName myListener = new ComponentName(context, TmfNotificationListenerService.class);
        for (String name : enabledListeners.split(":")) {
            ComponentName candidate = ComponentName.unflattenFromString(name);
            if (candidate != null && candidate.equals(myListener)) {
                return true;
            }
        }
        return false;
    }
}
