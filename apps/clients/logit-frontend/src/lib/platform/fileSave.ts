import { registerPlugin } from "@capacitor/core";
import { isNativePlatform } from "./isNative";

interface FileSaverPlugin {
  saveFile(options: {
    filename: string;
    content: string;
    mimeType: string;
  }): Promise<{ uri: string }>;
}

const FileSaver = registerPlugin<FileSaverPlugin>("FileSaver");

export async function saveTextFile(filename: string, content: string): Promise<void> {
  if (isNativePlatform()) {
    await FileSaver.saveFile({ filename, content, mimeType: "application/json" });
  } else {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
