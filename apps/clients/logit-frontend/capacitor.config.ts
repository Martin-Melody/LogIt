import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.app",
  appName: "LogIt",
  webDir: "build",
  server: {
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
