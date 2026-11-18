// Which place a workout is at (My gym, G9). Set when a workout starts: the usual place for the
// day, else the last one used. "Where are you today?" can change it once, or be skipped; with no
// places a workout has none and works exactly as before.
import type { WorkoutSession } from "@logit/core/domain/workout";
import { placesStore } from "./places.svelte";

export function withStartingPlace(session: WorkoutSession): WorkoutSession {
  if (session.placeId !== undefined) return session;
  const place = placesStore.defaultFor();
  return { ...session, placeId: place?.id ?? null, placeAsked: !placesStore.shouldAsk };
}
