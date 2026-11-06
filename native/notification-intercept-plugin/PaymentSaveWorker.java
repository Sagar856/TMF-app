package com.trackmoneyflow.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.concurrent.futures.CallbackToFutureAdapter;
import androidx.work.BackoffPolicy;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.ListenableWorker;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkerParameters;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.JSONObject;
import org.json.JSONException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

public final class PaymentSaveWorker extends ListenableWorker {
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private volatile boolean finished;
    private CallbackToFutureAdapter.Completer<Result> completion;
    private final String id;
    private JSONObject payment;
    private final Runnable timeout = () -> finish(false, "Saving timed out; payment retained for retry");

    public PaymentSaveWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
        id = parameters.getInputData().getString("paymentId");
    }

    public static void enqueue(Context context, String id) {
        enqueue(context, id, false);
    }

    public static void enqueue(Context context, String id, boolean retryNow) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PaymentSaveWorker.class)
            .setInputData(new Data.Builder().putString("paymentId", id).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork("minarth-save-" + id,
            retryNow ? ExistingWorkPolicy.REPLACE : ExistingWorkPolicy.KEEP, request);
    }

    @NonNull
    @Override
    public ListenableFuture<Result> startWork() {
        return CallbackToFutureAdapter.getFuture(completer -> {
            completion = completer;
            main.post(() -> {
                try {
                    payment = InterceptedPaymentStore.find(getApplicationContext(), id);
                    if (payment == null || !"saving".equals(payment.optString("action"))) {
                        finish(true, null);
                        return;
                    }
                    InterceptedPaymentStore.action(getApplicationContext(), id, "saving");
                    // Application-context WebView: no Activity, task or notification trampoline.
                    webView = new WebView(getApplicationContext());
                    webView.getSettings().setJavaScriptEnabled(true);
                    webView.getSettings().setDomStorageEnabled(true);
                    webView.getSettings().setAllowFileAccess(false);
                    webView.getSettings().setAllowContentAccess(false);
                    webView.addJavascriptInterface(new BackgroundBridge(), "PaymentBackground");
                    webView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            return true;
                        }

                        @Override
                        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                            android.net.Uri uri = request.getUrl();
                            if (!"https".equals(uri.getScheme()) || !"localhost".equals(uri.getHost())) return null;
                            String path = uri.getPath();
                            if (path == null || path.contains("..")
                                || !(path.equals("/payment-background.html") || path.startsWith("/assets/"))) {
                                return missingAsset();
                            }
                            String mime = path.endsWith(".html") ? "text/html"
                                : path.endsWith(".js") ? "text/javascript" : "application/octet-stream";
                            try {
                                return new WebResourceResponse(mime, "UTF-8",
                                    getApplicationContext().getAssets().open("public" + path));
                            } catch (IOException error) {
                                Log.e("TMFInterceptor", "Background payment asset unavailable", error);
                                main.post(() -> finish(false, "Background save assets unavailable; update the app"));
                                return missingAsset();
                            }
                        }
                    });
                    main.postDelayed(timeout, 60000);
                    webView.loadUrl("https://localhost/payment-background.html");
                } catch (JSONException | IllegalStateException error) {
                    Log.e("TMFInterceptor", "Could not start background payment saving", error);
                    finish(false, "Could not start saving; payment retained for retry");
                }
            });
            return "minarth-background-payment-" + id;
        });
    }

    private static WebResourceResponse missingAsset() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
            java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    public final class BackgroundBridge {
        @JavascriptInterface
        public String input() { return payment.toString(); }

        @JavascriptInterface
        public String locationName(double lat, double lng) {
            try {
                String name = InterceptedPaymentStore.readableLocationName(getApplicationContext(), lat, lng);
                if (name == null || name.trim().isEmpty()) Log.w("TMFInterceptor", "No readable captured location; coordinates retained");
                return name;
            } catch (IOException | IllegalArgumentException error) {
                Log.w("TMFInterceptor", "Captured location could not be resolved; coordinates retained", error);
                return null;
            }
        }

        @JavascriptInterface
        public boolean complete(String result) {
            if (finished || isStopped()) return false;
            try {
                InterceptedPaymentStore.completeSave(getApplicationContext(), id, new JSONObject(result));
                main.post(() -> finish(true, null));
                return true;
            } catch (JSONException | IllegalStateException | SecurityException error) {
                Log.e("TMFInterceptor", "Could not persist background save receipt", error);
                main.post(() -> finish(false, "Could not confirm payment save; retained for retry"));
                return false;
            }
        }

        @JavascriptInterface
        public void fail(String message) { main.post(() -> finish(false, message)); }
    }

    private void finish(boolean success, String message) {
        if (finished || isStopped()) return;
        finished = true;
        cleanup();
        if (!success) {
            Log.e("TMFInterceptor", "Background payment save failed: " + message);
            try {
                InterceptedPaymentStore.saveFailed(getApplicationContext(), id, message);
            } catch (JSONException | IllegalStateException | SecurityException error) {
                Log.e("TMFInterceptor", "Could not display payment save failure", error);
            }
        }
        completion.set(success ? Result.success() : Result.retry());
    }

    private void cleanup() {
        main.removeCallbacks(timeout);
        if (webView != null) {
            webView.removeJavascriptInterface("PaymentBackground");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
    }

    @Override
    public void onStopped() {
        main.post(() -> { finished = true; cleanup(); });
    }
}
