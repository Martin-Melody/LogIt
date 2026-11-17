import type { SessionSource } from "@logit/core/domain/workout";
import type { MusicApp } from "./playlistLinks";

/** A playlist link saved in Settings › Music. */
export type WorkoutPlaylist = {
  id: string;
  name: string;
  url: string;
  app: MusicApp;
  kind: string;
  packageName?: string;
  playUri?: string;
  /** Cover from the app's oEmbed; null when not found. */
  imageUrl?: string | null;
  /** The split day it's for. Unset: any day. */
  day?: PlaylistDay | null;
};

export type PlaylistDay = {
  splitId: string;
  dayId: string;
  /** As the day was named when linked, shown if the split changes. */
  dayName: string;
};

/**
 * The playlist to start for a workout: the one linked to the split (or program) day it
 * was started from, else the first "any day" one. Null when none fits.
 */
export function pickPlaylist(
  playlists: WorkoutPlaylist[],
  source: SessionSource | null | undefined,
): WorkoutPlaylist | null {
  if (source) {
    const forDay = playlists.find(
      (p) => p.day && p.day.dayId === source.dayId && p.day.splitId === source.parentId,
    );
    if (forDay) return forDay;
  }
  return playlists.find((p) => !p.day) ?? null;
}

/**
 * Whether a session that just showed up was started now (so its music should start),
 * not a draft reloaded after the app restarted.
 */
export function isFreshStart(startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs < 2 * 60_000 && nowMs >= startedAtMs - 60_000;
}
