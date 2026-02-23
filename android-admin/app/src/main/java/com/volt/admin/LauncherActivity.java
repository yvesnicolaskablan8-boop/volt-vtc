package com.volt.admin;

import android.app.Activity;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.CookieManager;
import android.net.Uri;
import android.content.Intent;

import org.json.JSONArray;

public class LauncherActivity extends Activity {

    private WebView webView;
    private static final String APP_URL = "https://volt-vtc.vercel.app/";
    private static final String ALLOWED_HOST = "volt-vtc.vercel.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen immersive mode
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );

        // Status bar color
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF3B82F6);
        }

        // Create WebView
        webView = new WebView(this);
        setContentView(webView);

        // Configure WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Mark as mobile app in user-agent
        settings.setUserAgentString(settings.getUserAgentString() + " VoltAdminApp/1.0");
        // useWideViewPort(true) = read the meta viewport tag (width=device-width)
        // loadWithOverviewMode(false) = don't zoom out to show full page
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Enable cookies (for session persistence)
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        // Add native bridge
        webView.addJavascriptInterface(new NativeBridge(this), "VoltNative");

        // Handle navigation
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && host.equals(ALLOWED_HOST)) {
                    return false; // Stay in WebView
                }
                // Open external links in browser
                Intent intent = new Intent(Intent.ACTION_VIEW, request.getUrl());
                startActivity(intent);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Show offline message
                view.loadData(
                    "<html><body style='display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0e17;color:#f1f5f9;font-family:sans-serif;text-align:center;'>" +
                    "<div><h2 style='color:#3b82f6;'>Volt Admin</h2>" +
                    "<p>Connexion impossible.</p>" +
                    "<p style='font-size:14px;color:#94a3b8;'>Verifiez votre connexion internet et reessayez.</p>" +
                    "<button onclick='location.reload()' style='margin-top:20px;padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;'>Reessayer</button>" +
                    "</div></body></html>",
                    "text/html", "UTF-8"
                );
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // Load app
        webView.loadUrl(APP_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            // Move to background instead of closing (app-like behavior)
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    // =================== NATIVE BRIDGE ===================

    public static class NativeBridge {
        private final Activity activity;

        NativeBridge(Activity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void vibrate(long duration) {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(duration);
            }
        }

        @JavascriptInterface
        public void vibratePattern(String patternJson, int repeat) {
            try {
                JSONArray arr = new JSONArray(patternJson);
                long[] pattern = new long[arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    pattern[i] = arr.getLong(i);
                }
                Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null) return;
                v.vibrate(pattern, repeat);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void cancelVibration() {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.cancel();
        }

        @JavascriptInterface
        public void setMaxVolume() {
            AudioManager audio = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            int maxVol = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, maxVol, 0);
        }

        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            activity.runOnUiThread(() -> {
                if (on) {
                    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }
}
