import { keyboard } from "$lib/stores/keybaord.store";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

let didSetup = false;

export async function setupKeyboard(): Promise<void> {
  if (didSetup) return;
  didSetup = true;

  if (!Capacitor.isNativePlatform()) {
    keyboard.set({ visible: false, height: 0 });
    return;
  }

  try {
    await Keyboard.setResizeMode({ mode: "native" as any });
  } catch {
    // not supported on all versions/platforms
  }

  keyboard.set({ visible: false, height: 0 });

  Keyboard.addListener("keyboardWillShow", (info) => {
    keyboard.set({
      visible: true,
      height: info.keyboardHeight ?? 0,
    });
  });

  Keyboard.addListener("keyboardWillHide", () => {
    keyboard.set({ visible: false, height: 0 });
  });
}
