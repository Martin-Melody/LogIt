import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAPACITOR_DEV_URL;

const config: CapacitorConfig = {
  appId: "ie.logit.app",
  appName: "LogIt",
  webDir: "build",
  server: {
    // http/cleartext are only for local live-reload against CAPACITOR_DEV_URL —
    // production builds must use the default https scheme (no cleartext traffic).
    ...(devServerUrl && {
      url: devServerUrl,
      androidScheme: "http",
      cleartext: true,
    }),
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/Databases",
      androidIsEncryption: false,
    },
    SplashScreen: {
      // Held until the web layer calls SplashScreen.hide() (see lib/platform/nativeShell.ts),
      // so users never see a white flash between the native splash and the app.
      launchAutoHide: false,
      backgroundColor: "#1D2035",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    LocalNotifications: {
      // App-branded status-bar icon (white dumbbell) instead of the generic bell.
      smallIcon: "ic_stat_logit",
      iconColor: "#5C6BC0",
    },
  },
};

export default config;
