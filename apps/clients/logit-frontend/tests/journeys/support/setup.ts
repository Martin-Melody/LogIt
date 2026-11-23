// Swaps the phone-only pieces for stand-ins so the app's real startup, sign-in, profile and
// sync code runs in Node as if on Android. Everything that should survive an app restart
// (the SQLite database, localStorage/Preferences, the secure token store) lives on the
// simulated device in device.ts, so `device.launch()` can drop every module and boot the app
// again against the same phone.
import { afterEach, vi } from "vitest";
import { currentDevice } from "./deviceState";

// A plugin that does nothing: every method resolves to {}, listeners can be added and removed.
// Enums (ImpactStyle.Light, …) read back as their own names.
const { noopPlugin, enumLike } = vi.hoisted(() => ({
  noopPlugin: () =>
    new Proxy({}, {
      get: (_t, prop) => {
        if (prop === "then") return undefined; // not a thenable
        if (prop === "addListener") return async () => ({ remove: async () => {} });
        return async () => ({});
      },
    }),
  enumLike: () => new Proxy({}, { get: (_t, prop) => (prop === "then" ? undefined : String(prop)) }),
}));

vi.mock("$app/environment", () => ({ browser: true, dev: false, building: false, version: "journey" }));

vi.mock("$app/navigation", () => ({
  goto: vi.fn(async (href: string) => { currentDevice().navigatedTo(href); }),
  onNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
  invalidate: vi.fn(),
  invalidateAll: vi.fn(),
  preloadData: vi.fn(),
  pushState: vi.fn(),
  replaceState: vi.fn(),
}));

vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/"), params: {} } }));

// Capacitor: report a native Android platform. Plugins get a no-op proxy (every method
// resolves to {}), which is what "the plugin did nothing interesting" looks like.
vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: () => true,
      getPlatform: () => "android",
      isPluginAvailable: () => false,
      convertFileSrc: (s: string) => s,
    },
    // The app's own plugins. Play Billing reports no purchases and no store, like a phone
    // without Google Play.
    registerPlugin: (name: string) =>
      name === "PlayBilling"
        ? new Proxy({}, {
            get: (_t, prop) => {
              if (prop === "then") return undefined;
              if (prop === "addListener") return async () => ({ remove: async () => {} });
              return async () => ({ purchases: [], products: [], available: false });
            },
          })
        : noopPlugin(),
  };
});

// The Android keystore-backed token store → the device's in-memory secure storage.
vi.mock("capacitor-secure-storage-plugin", () => ({
  SecureStoragePlugin: {
    async get({ key }: { key: string }) {
      const v = currentDevice().secure.get(key);
      if (v === undefined) throw new Error("Item with given key does not exist");
      return { value: v };
    },
    async set({ key, value }: { key: string; value: string }) {
      currentDevice().secure.set(key, value);
      return { value: true };
    },
    async remove({ key }: { key: string }) {
      currentDevice().secure.delete(key);
      return { value: true };
    },
    async keys() {
      return { value: [...currentDevice().secure.keys()] };
    },
    async clear() {
      currentDevice().secure.clear();
      return { value: true };
    },
  },
}));

// The Capacitor SQLite plugin → the device's node:sqlite database. The bundled food database
// isn't shipped here, so opening it fails and the app falls back to online lookups, as a
// build without food.db does.
vi.mock("@capacitor-community/sqlite", () => {
  class SQLiteConnection {
    async checkConnectionsConsistency() { return { result: true }; }
    async closeAllConnections() {}
    async isConnection() { return { result: false }; }
    async retrieveConnection() { return currentDevice().db; }
    async createConnection(name: string) {
      if (name !== "logit") throw new Error(`No ${name} database on this test device`);
      return currentDevice().db;
    }
    async copyFromAssets() { throw new Error("No bundled assets on this test device"); }
    async isDatabase() { return { result: false }; }
    async closeConnection() {}
  }
  return { SQLiteConnection, CapacitorSQLite: {} };
});

// The Capacitor plugin packages the app imports. Their own registerPlugin() call reaches the
// real @capacitor/core inside node_modules, so each gets a do-nothing stand-in here instead.
vi.mock("@capacitor/app", () => ({ App: noopPlugin() }));
vi.mock("@capacitor/camera", () => ({ Camera: noopPlugin(), CameraResultType: enumLike(), CameraSource: enumLike() }));
vi.mock("@capacitor/haptics", () => ({ Haptics: noopPlugin(), ImpactStyle: enumLike(), NotificationType: enumLike() }));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: noopPlugin(), KeyboardResize: enumLike(), KeyboardStyle: enumLike() }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: noopPlugin() }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: noopPlugin() }));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: noopPlugin(), Style: enumLike() }));
vi.mock("@capacitor/share", () => ({ Share: noopPlugin() }));
vi.mock("@capacitor-mlkit/barcode-scanning", () => ({ BarcodeScanner: noopPlugin(), BarcodeFormat: enumLike() }));
vi.mock("@capacitor-mlkit/text-recognition", () => ({ TextRecognition: noopPlugin() }));

// Each test's phones stop when it ends, so no timer from one test reaches the next. Module
// reloads between phones mean a timer can belong to a copy of a module the phone no longer
// holds (the 20 s notification check), so every interval a test started is cleared as well.
const intervals = new Set<ReturnType<typeof setInterval>>();
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
  const id = realSetInterval(...args);
  intervals.add(id);
  return id;
}) as typeof setInterval;
globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
  if (id !== undefined) intervals.delete(id);
  realClearInterval(id);
}) as typeof clearInterval;

afterEach(async () => {
  const { stopAllDevices } = await import("./device");
  await stopAllDevices();
  for (const id of intervals) realClearInterval(id);
  intervals.clear();
});
