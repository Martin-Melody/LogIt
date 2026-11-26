// Choosing a photo anywhere in the app (design canvas U1–U5): our own sheet (library, camera,
// remove), then the phone's own picker or camera, then, where the photo is shown in a fixed
// shape, our cropper. <PhotoChooserHost> in the root layout draws whichever step is open.

export type CropOptions = {
  /** Frame width / height; null = the photo's own shape. */
  aspect: number | null;
  round?: boolean;
  /** Shapes to pick from (a post photo); `aspect` is the one it opens on. */
  aspects?: { label: string; value: number | null }[];
};

export type ChooseOptions = {
  /** The sheet's title, e.g. "Profile photo". */
  title: string;
  /** Cropping step; none = the whole photo, only resized. */
  crop?: CropOptions | null;
  maxPx: number;
  quality?: number;
  /** Offers "Remove photo" (there's one to remove). */
  canRemove?: boolean;
};

/** A JPEG data URL, "removed", or null when the person backed out. */
export type Chosen = { photo: string } | { removed: true } | null;

type Step = { opts: ChooseOptions; resolve: (c: Chosen) => void; cropping: string | null };

export const chooser = $state<{ step: Step | null }>({ step: null });

export function choosePhoto(opts: ChooseOptions): Promise<Chosen> {
  chooser.step?.resolve(null);
  return new Promise((resolve) => {
    chooser.step = { opts, resolve, cropping: null };
  });
}

/** Ends the current choice; the host calls this. */
export function finishChoice(result: Chosen): void {
  const step = chooser.step;
  if (!step) return;
  if (step.cropping) URL.revokeObjectURL(step.cropping);
  chooser.step = null;
  step.resolve(result);
}
