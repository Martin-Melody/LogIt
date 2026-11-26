import { toast } from "svelte-sonner";
import { ApiError } from "@logit/core/api/client";
import { uploadPhoto } from "@logit/core/api/photosApi";
import { pickImageFile } from "$lib/platform/filePick";
import { resizeImageFile } from "$lib/platform/imageResize";

export type UploadedPhoto = Awaited<ReturnType<typeof uploadPhoto>>;

/** A picked photo waiting above a chat's message box (canvas board 18): it uploads straight
 * away, so a caption can be typed meanwhile and one Send sends both. */
export class StagedPhoto {
  current = $state<{ file: File; preview: string; state: "uploading" | "done" | "error"; photo?: UploadedPhoto } | null>(null);

  /** The uploaded photo, once it's ready to send. */
  get ready(): UploadedPhoto | undefined {
    return this.current?.state === "done" ? this.current.photo : undefined;
  }

  async pick(from: "photos" | "camera") {
    let file: File;
    try {
      file = await pickImageFile(from);
    } catch {
      return; // cancelled
    }
    this.drop();
    this.current = { file, preview: URL.createObjectURL(file), state: "uploading" };
    await this.upload();
  }

  async upload() {
    const s = this.current;
    if (!s) return;
    this.current = { ...s, state: "uploading" };
    try {
      const photo = await uploadPhoto(await resizeImageFile(s.file, 2048, 0.85));
      if (this.current?.file === s.file) this.current = { ...this.current, state: "done", photo };
    } catch (e) {
      if (this.current?.file === s.file) this.current = { ...this.current, state: "error" };
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Photos need a connection. Try again when you're online.");
    }
  }

  drop() {
    if (this.current) URL.revokeObjectURL(this.current.preview);
    this.current = null;
  }
}
