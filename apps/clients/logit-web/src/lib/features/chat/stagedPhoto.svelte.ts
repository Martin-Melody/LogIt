import { uploadPhoto, type SentPhoto } from "@logit/core/api/photosApi";
import { shrinkPhoto } from "$lib/features/coaching/myCoachData";

/** A photo waiting in a chat's message box (canvas board 19): picked, pasted or dropped. It
 * uploads straight away, so a caption can be typed meanwhile and one Send sends both. */
export class StagedPhoto {
  current = $state<{ file: File; preview: string; state: "uploading" | "done" | "error"; photo?: SentPhoto; error?: string } | null>(null);

  get ready(): SentPhoto | undefined {
    return this.current?.state === "done" ? this.current.photo : undefined;
  }

  /** Opens the file chooser. */
  choose() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.stage(file);
    };
    input.click();
  }

  async stage(file: File) {
    if (!file.type.startsWith("image/")) return;
    this.drop();
    this.current = { file, preview: URL.createObjectURL(file), state: "uploading" };
    await this.upload();
  }

  async upload() {
    const s = this.current;
    if (!s) return;
    this.current = { ...s, state: "uploading", error: undefined };
    try {
      const photo = await uploadPhoto(await shrinkPhoto(s.file, 2048));
      if (this.current?.file === s.file) this.current = { ...this.current, state: "done", photo };
    } catch (e) {
      if (this.current?.file === s.file) this.current = { ...this.current, state: "error", error: e instanceof Error ? e.message : "Couldn't upload it." };
    }
  }

  drop() {
    if (this.current) URL.revokeObjectURL(this.current.preview);
    this.current = null;
  }
}

/** The first image in a paste or a drop, if any. */
export function imageFrom(data: DataTransfer | null): File | null {
  return [...(data?.files ?? [])].find((f) => f.type.startsWith("image/")) ?? null;
}
