// Minimal in-memory localStorage for repo code that touches the global directly (e.g.
// localAccountRepo.ts's "had an account" marker) instead of going through $app/environment's
// `browser` guard. Node 25 has an experimental global `localStorage` that needs a file path to
// actually work; simplest to just replace it with a plain in-memory Map-backed stub for tests.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
});
