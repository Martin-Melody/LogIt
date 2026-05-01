import { isNativePlatform } from "./isNative";

/**
 * On native: uses @capawesome/capacitor-file-picker so the WebView lifecycle
 * is handled correctly (avoids the app-pause/resume that resets Svelte state).
 * On web: falls back to a programmatic <input type="file">.
 * Always resolves to a File object so callers are platform-agnostic.
 */
export async function pickImageFile(): Promise<File> {
  if (isNativePlatform()) {
    const { FilePicker } = await import("@capawesome/capacitor-file-picker");

    const result = await FilePicker.pickFiles({
      types: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
      readData: true,
    });

    const file = result.files[0];
    if (!file) throw new Error("No file selected.");
    if (!file.data) throw new Error("Could not read file data.");

    const byteArray = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    const blob = new Blob([byteArray], { type: file.mimeType ?? "image/jpeg" });
    return new File([blob], file.name ?? "avatar", { type: blob.type });
  } else {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return reject(new Error("No file selected."));
        resolve(file);
      };

      input.oncancel = () => reject(new Error("cancelled"));
      input.click();
    });
  }
}

export async function pickTextFile(): Promise<string> {
  if (isNativePlatform()) {
    const { FilePicker } = await import("@capawesome/capacitor-file-picker");

    const result = await FilePicker.pickFiles({
      types: ["application/json"],
      readData: true,
    });

    const file = result.files[0];
    if (!file) throw new Error("No file selected.");
    if (!file.data) throw new Error("Could not read file data.");

    return atob(file.data);
  } else {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return reject(new Error("No file selected."));

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsText(file);
      };

      input.oncancel = () => reject(new Error("cancelled"));
      input.click();
    });
  }
}
