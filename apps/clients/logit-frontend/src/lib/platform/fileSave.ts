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
  if (content.length === 0) {
    throw new Error("Refusing to save an empty file.");
  }

  if (isNativePlatform()) {
    const result = await FileSaver.saveFile({ filename, content, mimeType: "application/json" });
    if (!result?.uri) {
      throw new Error("File save did not report a destination.");
    }
  } else {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      // The anchor must be attached to the document for click() to reliably
      // trigger a download in all browsers, and the object URL must outlive
      // the click — revoking it immediately races the browser reading the
      // blob, which silently produced 0-byte downloads for larger exports.
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
