// Which simulated phone the mocks in setup.ts are talking to. Kept in its own tiny module (and
// on globalThis) so it survives vi.resetModules(), which device.launch() uses to restart the app.
import type { Device } from "./device";

const KEY = "__logitJourneyDevice";

export function currentDevice(): Device {
  const d = (globalThis as Record<string, unknown>)[KEY] as Device | undefined;
  if (!d) throw new Error("No test device is running. Call device.launch() first.");
  return d;
}

export function setCurrentDevice(d: Device | null): void {
  (globalThis as Record<string, unknown>)[KEY] = d;
}
