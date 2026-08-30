/** Capture a small meal photo as a data URL. Uses @capacitor/camera — native camera/gallery
 * prompt on device, a file picker on the web. Returns null if the user cancels or no camera
 * is available. Kept small (quality 45, ~900px) since it rides in the synced diary blob. */
export async function captureMealPhoto(): Promise<string | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 45,
      width: 900,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      allowEditing: false,
      correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  } catch {
    return null;
  }
}
