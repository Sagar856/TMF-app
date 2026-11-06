package com.trackmoneyflow.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import android.os.Bundle;
import android.util.Log;

public class PaymentActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("tmfPaymentId");
        if (id == null) return;
        try {
            if (("tmf.add." + id).equals(intent.getAction())) {
                org.json.JSONObject payment = InterceptedPaymentStore.find(context, id);
                boolean retryNow = payment != null && payment.has("saveError");
                InterceptedPaymentStore.action(context, id, "saving");
                PaymentSaveWorker.enqueue(context, id, retryNow);
                return;
            }
            if (("tmf.description." + id).equals(intent.getAction())) {
                Bundle reply = RemoteInput.getResultsFromIntent(intent);
                CharSequence description = reply == null ? null : reply.getCharSequence("tmfDescription");
                if (description != null) InterceptedPaymentStore.description(context, id, description.toString());
                return;
            }
            if (!("tmf.ignore." + id).equals(intent.getAction())) return;
            InterceptedPaymentStore.action(context, id, "ignore");
            ContextCompat.getSystemService(context, NotificationManager.class).cancel(id, 1);
        } catch (org.json.JSONException | IllegalStateException | SecurityException error) {
            Log.e("TMFInterceptor", "Could not persist payment notification action", error);
            if (("tmf.add." + id).equals(intent.getAction())) {
                try {
                    InterceptedPaymentStore.saveFailed(context, id, "Could not schedule saving. Tap Add to retry");
                } catch (org.json.JSONException | IllegalStateException | SecurityException displayError) {
                    Log.e("TMFInterceptor", "Could not display scheduling failure", displayError);
                }
            }
        }
    }
}
