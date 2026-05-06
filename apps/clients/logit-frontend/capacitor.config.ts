import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV !== "production";

const config: CapacitorConfig = {
  appId: "com.example.app",
  appName: "LogIt",
  webDir: "build",
  server: {
    ...(isDev && { url: "http://10.200.0.2:3000" }),
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
