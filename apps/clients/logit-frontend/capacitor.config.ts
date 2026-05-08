import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAPACITOR_DEV_URL;

const config: CapacitorConfig = {
  appId: "com.example.app",
  appName: "LogIt",
  webDir: "build",
  server: {
    ...(devServerUrl && { url: devServerUrl }),
    cleartext: true,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/Databases",
      androidIsEncryption: false,
    },
  },
};

export default config;
