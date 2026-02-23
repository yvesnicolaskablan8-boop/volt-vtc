package com.volt.chauffeur;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

/**
 * LauncherActivity — Lance la PWA Volt Chauffeur en mode TWA (Trusted Web Activity).
 *
 * Utilise le moteur Chrome complet pour garantir le support de :
 * - Web Audio API (alarme sonore en cas d'impaye)
 * - navigator.vibrate() (vibration forte)
 * - Service Worker + Push Notifications
 * - Mode standalone sans barre d'URL (si assetlinks.json configure)
 */
public class LauncherActivity extends Activity {

    private static final Uri LAUNCH_URI = Uri.parse("https://volt-vtc.vercel.app/driver/");
    private CustomTabsServiceConnection serviceConnection;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        launchTwa();
    }

    private void launchTwa() {
        // Trouver le package Chrome disponible
        String packageName = CustomTabsClient.getPackageName(this, null);
        if (packageName == null) {
            // Chrome non installe — fallback navigateur par defaut
            openInBrowser();
            return;
        }

        serviceConnection = new CustomTabsServiceConnection() {
            @Override
            public void onCustomTabsServiceConnected(
                    ComponentName name, CustomTabsClient client) {
                client.warmup(0L);
                CustomTabsSession session = client.newSession(new CustomTabsCallback());

                if (session == null) {
                    openInBrowser();
                    return;
                }

                // Lancer la TWA
                TrustedWebActivityIntentBuilder builder =
                        new TrustedWebActivityIntentBuilder(LAUNCH_URI);
                builder.build(session).launchTrustedWebActivity(LauncherActivity.this);
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                serviceConnection = null;
            }
        };

        CustomTabsClient.bindCustomTabsService(this, packageName, serviceConnection);
    }

    private void openInBrowser() {
        Intent browserIntent = new Intent(Intent.ACTION_VIEW, LAUNCH_URI);
        startActivity(browserIntent);
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (serviceConnection != null) {
            try {
                unbindService(serviceConnection);
            } catch (Exception e) {
                // Ignorer si deja deconnecte
            }
        }
    }
}
