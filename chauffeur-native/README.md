# Pilote Chauffeur — App native (Capacitor + Transistorsoft)

App Android qui charge l'interface chauffeur en direct depuis
`https://gestion.pilote.tech/driver/` (mises à jour web automatiques) et ajoute
le **suivi GPS natif en arrière-plan** via
`@transistorsoft/capacitor-background-geolocation` : le suivi continue même
app fermée, écran verrouillé ou téléphone redémarré.

Le service natif POSTe chaque position directement vers le RPC Supabase
`fleet_ingest_position` (position temps réel + trajet du jour) — voir
`driver/js/driver-app.js` → `_startNativeTracking()` pour la configuration.

## Construire l'APK (debug)

```bash
cd chauffeur-native
npm install
npx cap sync android
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
# APK : android/app/build/outputs/apk/debug/app-debug.apk
```

## Installation sur les téléphones chauffeurs

1. Désinstaller l'ancienne app « Volt Chauffeur » (signature différente, la
   mise à jour par-dessus est impossible).
2. Installer `app-debug.apk`.
3. Au premier lancement, accepter la localisation **« Tout le temps »**
   (l'app guide le chauffeur vers les réglages).

## Licence Transistorsoft (production)

Le plugin est **gratuit et complet en build DEBUG**. Pour un build RELEASE
(Play Store), acheter une licence sur https://shop.transistorsoft.com pour
l'applicationId `com.volt.chauffeur`, puis ajouter dans
`android/app/src/main/AndroidManifest.xml` (dans `<application>`) :

```xml
<meta-data android:name="com.transistorsoft.locationmanager.license"
           android:value="VOTRE_CLE_LICENCE" />
```

La licence MAURALEX (`tech.pilote.camions`) ne couvre PAS cette app.
