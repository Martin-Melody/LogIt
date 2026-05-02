import { isNativePlatform } from "./isNative";

/**
 * On native: uses @capacitor/camera with CameraSource.Prompt, which shows
 * the OS-native "Take photo / Choose from library" dialog and opens the
 * photos gallery (not the file system) for the library option.
 * On web: falls back to a programmatic <input type="file">.
 * Always resolves to a File so callers are platform-agnostic.
 */
export async function pickImageFile(): Promise<File> {
  if (isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
      quality: 90,
      correctOrientation: true,
    });

    if (!photo.base64String) throw new Error("No photo data returned.");

    const mimeType = `image/${photo.format ?? "jpeg"}`;
    const byteArray = Uint8Array.from(atob(photo.base64String), (c) => c.charCodeAt(0));
    const blob = new Blob([byteArray], { type: mimeType });
    return new File([blob], `avatar.${photo.format ?? "jpg"}`, { type: mimeType });
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
