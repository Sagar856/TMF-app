package com.trackmoneyflow.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class PaymentActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("tmfPaymentId");
        if (id == null) return;
        try {
            InterceptedPaymentStore.action(context, id, "ignore");
            context.getSystemService(NotificationManager.class).cancel(id, 1);
        } catch (org.json.JSONException | IllegalStateException error) {
            Log.e("TMFInterceptor", "Could not persist Ignore action", error);
        }
    }
}
