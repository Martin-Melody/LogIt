import { choosePhoto } from "$lib/features/photos/photoChooser.svelte";

/** A small meal photo as a data URL, through the app's photo sheet (library or camera); null if
 * the person backs out. Kept small (~900 px) since it rides in the synced diary blob. */
export async function captureMealPhoto(): Promise<string | null> {
  const chosen = await choosePhoto({ title: "Meal photo", maxPx: 900, quality: 0.6 });
  return chosen && "photo" in chosen ? chosen.photo : null;
}
