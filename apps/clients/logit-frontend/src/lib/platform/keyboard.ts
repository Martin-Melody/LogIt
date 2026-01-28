import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

export async function setupKeyboard() {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== "ios") return;

  await Keyboard.setResizeMode({ mode: KeyboardResize.None });
}

