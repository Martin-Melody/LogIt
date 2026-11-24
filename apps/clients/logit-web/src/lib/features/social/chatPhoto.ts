// Choosing and uploading a photo to send in a chat (people or coaching, design canvas C2).
import { uploadPhoto, type SentPhoto } from "@logit/core/api/photosApi";
import { shrinkPhoto } from "$lib/features/coaching/myCoachData";

/** Opens the file chooser; null when nothing was picked. Throws when the upload fails. */
export function pickAndUploadPhoto(): Promise<SentPhoto | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      shrinkPhoto(file, 2048).then(uploadPhoto).then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
