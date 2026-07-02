import type { CapacitorConfig } from '@capacitor/cli';

// App native chauffeur Pilote (Capacitor) — même montage que MAURALEX :
// on charge l'URL distante (UI auto-mise-à-jour à chaque déploiement web),
// seul le natif (plugin GPS Transistorsoft) nécessite un rebuild d'APK.
const config: CapacitorConfig = {
  appId: 'com.volt.chauffeur',
  appName: 'Pilote Chauffeur',
  webDir: 'capacitor-www',
  server: {
    url: 'https://gestion.pilote.tech/driver/',
    androidScheme: 'https',
    cleartext: false,
  },
  backgroundColor: '#0a0e17',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0e17',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
