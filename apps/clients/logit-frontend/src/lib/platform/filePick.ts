import { isNativePlatform } from "./isNative";

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
