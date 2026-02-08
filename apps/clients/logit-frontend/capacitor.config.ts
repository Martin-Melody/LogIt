import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.app",
  appName: "LogIt",
  webDir: "build",
  server: {
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      hidden: false,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/Databases",
    },
  },
};

export default config;
