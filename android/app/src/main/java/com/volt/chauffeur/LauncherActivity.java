package com.volt.chauffeur;

import android.app.Activity;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.PermissionRequest;

/**
 * LauncherActivity — App native Volt Chauffeur avec WebView integre.
 *
 * L'app charge la PWA dans un WebView interne (pas de navigateur externe).
 * Fonctionnalites natives exposees via JavascriptInterface :
 * - Vibration forte (native Android, plus puissante que navigator.vibrate)
 * - Controle du volume (forcer volume max pour l'alarme)
 * - Keep screen on (empecher la mise en veille pendant l'alarme)
 */
public class LauncherActivity extends Activity {

    private static final String APP_URL = "https://volt-vtc.vercel.app/driver/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Plein ecran immersif
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        // Creer le WebView
        webView = new WebView(this);
        setContentView(webView);

        // Configurer le WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);           // localStorage / sessionStorage
        settings.setDatabaseEnabled(true);             // IndexedDB
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false); // Audio sans interaction
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // User-Agent personnalise pour identifier l'app native
        String ua = settings.getUserAgentString();
        settings.setUserAgentString(ua + " VoltChauffeurApp/1.0");

        // Exposer l'interface native au JavaScript
        webView.addJavascriptInterface(new NativeBridge(this), "VoltNative");

        // Gerer la navigation dans le WebView (pas dans le navigateur externe)
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Garder la navigation dans le WebView pour le domaine volt
                if (url.contains("volt-vtc.vercel.app")) {
                    return false;
                }
                // Liens externes → ouvrir dans le navigateur
                android.content.Intent intent = new android.content.Intent(
                    android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse(url)
                );
                startActivity(intent);
                return true;
            }
        });

        // Gerer les permissions (notifications, audio, etc.)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        // Charger l'app
        webView.loadUrl(APP_URL);
    }

    // Bouton retour → navigation dans le WebView
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
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

    /**
     * Interface JavaScript → Java native.
     * Accessible depuis le JS via : window.VoltNative.methodName()
     */
    public static class NativeBridge {
        private final Context context;

        NativeBridge(Context context) {
            this.context = context;
        }

        /**
         * Vibre avec un pattern natif (plus puissant que navigator.vibrate).
         * Appel JS : window.VoltNative.vibrate(500, 200, 500, 200, 500)
         */
        @JavascriptInterface
        public void vibrate(long duration) {
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(duration);
            }
        }

        /**
         * Vibre avec un pattern repete.
         * pattern: durees en ms alternant pause/vibration
         * repeat: index de repetition (-1 = pas de repetition)
         */
        @JavascriptInterface
        public void vibratePattern(String patternJson, int repeat) {
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;

            try {
                org.json.JSONArray arr = new org.json.JSONArray(patternJson);
                long[] pattern = new long[arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    pattern[i] = arr.getLong(i);
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(pattern, repeat));
                } else {
                    v.vibrate(pattern, repeat);
                }
            } catch (Exception e) {
                // Ignorer les erreurs de parsing
            }
        }

        /**
         * Arreter la vibration.
         */
        @JavascriptInterface
        public void cancelVibration() {
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.cancel();
        }

        /**
         * Mettre le volume media au maximum.
         */
        @JavascriptInterface
        public void setMaxVolume() {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            am.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
        }

        /**
         * Empecher la mise en veille de l'ecran.
         */
        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            ((Activity) context).runOnUiThread(() -> {
                if (on) {
                    ((Activity) context).getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    );
                } else {
                    ((Activity) context).getWindow().clearFlags(
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    );
                }
            });
        }

        /**
         * Verifier si on est dans l'app native (pour adapter le comportement JS).
         */
        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }
    }
}
