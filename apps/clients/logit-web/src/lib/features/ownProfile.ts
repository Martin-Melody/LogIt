import { syncApi, type RemoteProfile } from "@logit/core/api/syncApi";
import { invalidateOwnProfile } from "$lib/deps";

/**
 * Change the logged-in user's synced profile from the dashboard.
 *
 * The server keeps the profile as one blob, replaced whole by any newer push, so this
 * always starts from a fresh pull and changes only the fields asked for. Two kinds of change:
 *
 * - `bump: true` (e.g. the active split): a newer `updatedAtMs`, so the server takes it and
 *   the phone applies it on its next sync.
 * - `bump: false` (goals and the weekly target): the same `updatedAtMs`. The server merges
 *   `goalsJson` key by key on each entry's own timestamp whatever the profile's age, and the
 *   phone does the same, so nothing else in the profile is touched.
 */
export async function updateOwnProfile(
  change: (p: RemoteProfile) => Partial<RemoteProfile>,
  opts: { bump: boolean },
): Promise<RemoteProfile> {
  const { profile } = await syncApi.pullProfile();
  if (!profile) throw new Error("Your profile hasn't synced from the app yet. Open LogIt on your phone once, then try again.");
  const next: RemoteProfile = { ...profile, ...change(profile) };
  if (opts.bump) next.updatedAtMs = Math.max(Date.now(), profile.updatedAtMs + 1);
  await syncApi.pushProfile(next);
  invalidateOwnProfile();
  return next;
}
