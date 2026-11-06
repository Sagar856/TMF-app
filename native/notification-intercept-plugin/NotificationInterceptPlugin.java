package com.trackmoneyflow.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
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
        recordLaunchAction(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        recordLaunchAction(intent);
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) activeInstance = null;
    }

    private void recordLaunchAction(Intent intent) {
        String id = intent.getStringExtra("tmfPaymentId");
        String action = intent.getStringExtra("tmfPaymentAction");
        if (id == null || !("add".equals(action) || "edit".equals(action) || "open".equals(action))) return;
        try {
            InterceptedPaymentStore.action(getContext(), id, action);
            intent.removeExtra("tmfPaymentId");
            intent.removeExtra("tmfPaymentAction");
        } catch (org.json.JSONException | IllegalStateException error) {
            android.util.Log.e("TMFInterceptor", "Could not save notification action", error);
        }
    }

    @PluginMethod
    public void clearPayments(PluginCall call) {
        try {
            InterceptedPaymentStore.clear(getContext());
            call.resolve();
        } catch (org.json.JSONException | IllegalStateException error) {
            call.reject("Could not clear intercepted payments", error);
        }
    }

    @PluginMethod
    public void reverseGeocode(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
            || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            call.reject("Valid coordinates required");
            return;
        }
        new Thread(() -> {
            try {
                String name = InterceptedPaymentStore.readableLocationName(getContext(), lat, lng);
                if (name == null || name.trim().isEmpty()) {
                    call.reject("No readable address found");
                    return;
                }
                JSObject result = new JSObject();
                result.put("name", name);
                call.resolve(result);
            } catch (java.io.IOException | IllegalArgumentException error) {
                call.reject("Could not resolve readable location", error);
            }
        }, "minarth-geocoder").start();
    }

    @PluginMethod
    public void configure(PluginCall call) {
        try {
            InterceptedPaymentStore.configure(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled")),
                Boolean.TRUE.equals(call.getBoolean("notifications")), Boolean.TRUE.equals(call.getBoolean("locationTracking")),
                call.getString("owner", ""));
            call.resolve();
        } catch (org.json.JSONException | IllegalStateException | SecurityException error) {
            call.reject("Could not configure interceptor", error);
        }
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("notifications", new JSArray(InterceptedPaymentStore.pending(getContext()).toString()));
            call.resolve(result);
        } catch (org.json.JSONException error) {
            call.reject("Could not read intercepted payment queue", error);
        }
    }

    @PluginMethod
    public void acknowledgeSaved(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("Payment id required"); return; }
        try {
            InterceptedPaymentStore.acknowledgeSaved(getContext(), id);
            call.resolve();
        } catch (org.json.JSONException | IllegalStateException error) {
            call.reject("Could not acknowledge saved payment", error);
        }
    }

    @PluginMethod
    public void resolvePayment(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("Payment id required"); return; }
        try {
            InterceptedPaymentStore.resolve(getContext(), id);
            call.resolve();
        } catch (org.json.JSONException | IllegalStateException error) {
            call.reject("Could not resolve intercepted payment", error);
        }
    }

    @PluginMethod
    public void acknowledgeAction(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("Payment id required"); return; }
        try {
            InterceptedPaymentStore.action(getContext(), id, "review");
            call.resolve();
        } catch (org.json.JSONException | IllegalStateException error) {
            call.reject("Could not acknowledge notification action", error);
        }
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
    public static void dispatchNotification(org.json.JSONObject record) {
        if (activeInstance == null) return;

        JSObject data = new JSObject();
        for (String key : new String[] { "id", "packageName", "title", "text", "postedAt", "action", "description", "location", "owner", "transaction" }) {
            data.put(key, record.opt(key));
        }
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
