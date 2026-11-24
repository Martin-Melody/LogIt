import { isNativePlatform } from "./isNative";

/**
 * On native: uses @capacitor/camera with CameraSource.Prompt, which shows
 * the OS-native "Take photo / Choose from library" dialog and opens the
 * photos gallery (not the file system) for the library option.
 * On web: falls back to a programmatic <input type="file">.
 * Always resolves to a File so callers are platform-agnostic.
 */
export async function pickImageFile(from: "prompt" | "photos" | "camera" = "prompt"): Promise<File> {
  if (isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: from === "photos" ? CameraSource.Photos : from === "camera" ? CameraSource.Camera : CameraSource.Prompt,
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
      if (from === "camera") input.capture = "environment";

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
  return (await pickText({ mimeTypes: ["application/json"], accept: ".json,application/json" })).text;
}

/** A text file chosen by the person, read as UTF-8 (names with accents, notes with emoji). */
export async function pickText(opts: { mimeTypes: string[]; accept: string }): Promise<{ text: string; name: string }> {
  if (isNativePlatform()) {
    const { FilePicker } = await import("@capawesome/capacitor-file-picker");

    const result = await FilePicker.pickFiles({
      types: opts.mimeTypes,
      readData: true,
    });

    const file = result.files[0];
    if (!file) throw new Error("No file selected.");
    if (!file.data) throw new Error("Could not read file data.");

    // atob gives one char per byte; decode the bytes as UTF-8.
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    return { text: new TextDecoder().decode(bytes), name: file.name };
  } else {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = opts.accept;

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return reject(new Error("No file selected."));

        const reader = new FileReader();
        reader.onload = () => resolve({ text: reader.result as string, name: file.name });
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsText(file);
      };

      input.oncancel = () => reject(new Error("cancelled"));
      input.click();
    });
  }
}
