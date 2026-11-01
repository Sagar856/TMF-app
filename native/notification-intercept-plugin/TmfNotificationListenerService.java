package com.trackmoneyflow.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * Android NotificationListenerService: once the user grants "Notification
 * Access" (see NotificationInterceptPlugin.requestPermission), the OS calls
 * onNotificationPosted() in real time for every notification posted by any
 * app on the device — including bank/UPI transaction alerts from apps like
 * Google Pay, PhonePe, Paytm, or the phone's default SMS app.
 */
public class TmfNotificationListenerService extends NotificationListenerService {

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        try {
            StatusBarNotification[] notifications = getActiveNotifications();
            if (notifications != null) {
                for (StatusBarNotification notification : notifications) onNotificationPosted(notification);
            }
        } catch (SecurityException error) {
            Log.e("TMFInterceptor", "Could not read active payment notifications", error);
        }
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        requestRebind(new android.content.ComponentName(this, TmfNotificationListenerService.class));
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        // Ignore our own app's notifications (e.g. the "Add this transaction?"
        // prompt we post ourselves) to avoid feedback loops.
        String packageName = sbn.getPackageName();
        if (packageName != null && packageName.equals(getPackageName())) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence titleChars = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textChars = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextChars = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        String title = titleChars == null ? "" : titleChars.toString();
        String text = bigTextChars != null ? bigTextChars.toString() : (textChars == null ? "" : textChars.toString());

        if (title.isEmpty() && text.isEmpty()) return;

        if (!TransactionEligibility.accepts(packageName, title, text)) return;
        try {
            org.json.JSONObject record = InterceptedPaymentStore.capture(this, packageName, title, text, sbn.getPostTime());
            if (record != null) NotificationInterceptPlugin.dispatchNotification(record);
        } catch (org.json.JSONException | IllegalStateException | SecurityException error) {
            Log.e("TMFInterceptor", "Could not capture payment notification", error);
        }
    }
}
