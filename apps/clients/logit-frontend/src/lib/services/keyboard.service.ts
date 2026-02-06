import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import type { PluginListenerHandle } from "@capacitor/core";
import { keyboard } from "$lib/stores/keybaord.store";

let showHandle: Promise<PluginListenerHandle> | null = null;
let hideHandle: Promise<PluginListenerHandle> | null = null;
let started = false;

export function startKeyboardTracking(): () => void {
  if (started) return stopKeyboardTracking;
  started = true;

  if (!Capacitor.isNativePlatform()) {
    keyboard.set({ visible: false, height: 0 });
    return stopKeyboardTracking;
  }

  showHandle = Keyboard.addListener("keyboardWillShow", (info) => {
    keyboard.set({
      visible: true,
      height:
        typeof info?.keyboardHeight === "number" ? info.keyboardHeight : 0,
    });
  });

  hideHandle = Keyboard.addListener("keyboardWillHide", () => {
    keyboard.set({ visible: false, height: 0 });
  });

  return stopKeyboardTracking;
}

export function stopKeyboardTracking() {
  // Fire-and-forget async cleanup (safe because we don't need to block UI)
  void (async () => {
    const resolvedShow = await showHandle;
    const resolvedHide = await hideHandle;

    await resolvedShow?.remove();
    await resolvedHide?.remove();

    showHandle = null;
    hideHandle = null;
    started = false;

    keyboard.set({ visible: false, height: 0 });
  })();
}
