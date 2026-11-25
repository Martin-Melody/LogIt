// The stories row (design canvas S1), the viewer (S2) and "Add to your story" (S3). The server
// decides who sees what; this keeps the row, which circle is open, and the add sheet.
import { storiesApi, type StoryAuthor } from "@logit/core/api/storiesApi";
import type { TrainingFriend } from "@logit/core/api/trainingApi";
import { authStore } from "$lib/api/authStore.svelte";
import { pickImageFile } from "$lib/platform/filePick";
import { resizeImageFile } from "$lib/platform/imageResize";

export const stories = $state({
  row: [] as StoryAuthor[],
  /** Who's training now, as the row last loaded it (the viewer shows it too). */
  training: [] as TrainingFriend[],
  /** "Your story" picker: choose a workout or record first. */
  picking: false,
  /** Index into row of the circle being watched, or null. */
  watching: null as number | null,
  /** "Add to your story": the cards to choose from (first is picked), and a photo already chosen
   * (a data URL, uploaded when it's posted). No cards = a photo on its own. */
  adding: null as { cards: { label: string; type: string; json: string }[]; fromWorkout: boolean; photo?: string } | null,
});

export async function loadStories(): Promise<void> {
  if (!authStore.isAuthenticated) return;
  try {
    stories.row = await storiesApi.row();
  } catch {
    // Keep what's shown; the next refresh tries again.
  }
}

export function watch(username: string): void {
  const i = stories.row.findIndex((a) => a.user.username === username);
  if (i >= 0) stories.watching = i;
}

/** Marks a story watched here at once (the ring goes grey) and on the server. */
export function markSeen(authorIndex: number, storyId: string): void {
  const s = stories.row[authorIndex]?.stories.find((x) => x.id === storyId);
  if (!s || s.seen) return;
  s.seen = true;
  storiesApi.seen(storyId).catch(() => {});
}

/** Unwatched stories come first in the row; after watching, a circle stays where it was until the next load. */
export function firstUnseen(a: StoryAuthor): number {
  const i = a.stories.findIndex((s) => !s.seen);
  return i < 0 ? 0 : i;
}

/** Picks a photo for a story, shrunk as message photos are; null if cancelled. Call from a tap
 * (the web file picker needs one). */
export async function pickStoryPhoto(from: "prompt" | "photos" | "camera" = "prompt"): Promise<string | null> {
  try {
    return await resizeImageFile(await pickImageFile(from), 2048, 0.85);
  } catch {
    return null;
  }
}
