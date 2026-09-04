// Computes and pushes the public profile snapshot (PATCH /users/me: displayName/bio/avatarUrl/
// publicProfileJson) — what ProfileView.svelte renders for anyone viewing this account,
// including a near-real-time view of yourself. Extracted out of the self-profile page's script
// (rather than living inline there) so it survives the P2 self-page/ProfileView unification
// planned in docs/architecture/profile-progress-redesign.md unchanged — call this from
// wherever local edits happen, not just one page.
//
// Distinct from syncService.ts's buildRemoteProfile()/pushProfile(), which is the *private*
// cross-device sync blob (nav layout, home widget layout, rest-timer defaults, active split) —
// nothing in that blob is visible to other users. This one is.
import { get } from "svelte/store";
import { apiClient } from "@logit/core/api/client";
import { authStore } from "$lib/api/authStore.svelte";
import { profile } from "$lib/stores/profile.store";
import { profileConfig } from "$lib/stores/profileConfig.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { getPersonalRecords } from "$lib/usecases/getPersonalRecords";
import { computeWeightTrend, computeStreak, computeBadges } from "./progressStats";

export async function pushPublicProfileSnapshot(): Promise<void> {
  if (!authStore.isAuthenticated) return;
  try {
    const profileSnap = get(profile);
    const configSnap = get(profileConfig);
    const [split, records, weightTrend, streak, badges] = await Promise.all([
      activeSplit.load(),
      getPersonalRecords(10),
      computeWeightTrend(),
      computeStreak(),
      computeBadges(),
    ]);

    const widgetSlots = configSnap.slots.map((s) => ({
      id: s.id,
      enabled: s.enabled,
      order: s.orderIndex,
    }));

    await apiClient.fetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: profileSnap.name || undefined,
        bio: profileSnap.bio || undefined,
        avatarUrl: profileSnap.avatarDataUrl || undefined,
        publicProfileJson: JSON.stringify({
          widgets: widgetSlots,
          bodyStats: {
            height: profileSnap.height,
            heightUnit: profileSnap.heightUnit,
            weight: profileSnap.weight,
            weightUnit: profileSnap.weightUnit,
          },
          activeSplit: split
            ? {
                name: split.name,
                days: split.days.map((d) => ({
                  name: d.name ?? `Day ${d.orderIndex + 1}`,
                  exercises: d.blocks
                    .filter((b) => b.type === "strength")
                    .map((b) => (b as { exerciseName: string }).exerciseName),
                })),
              }
            : null,
          personalRecords: records.map((r) => ({
            exerciseName: r.exerciseName,
            weight: r.weight,
            reps: r.reps,
          })),
          progressPhoto: profileSnap.progressPhotoDataUrl
            ? { dataUrl: profileSnap.progressPhotoDataUrl, updatedAtMs: Date.now() }
            : null,
          weightTrend,
          streak,
          badges,
        }),
      }),
    });
  } catch {
    // non-fatal — the local widgets already show live data regardless of whether the push
    // to the public snapshot succeeded; a visitor's view just stays stale until it does.
  }
}
