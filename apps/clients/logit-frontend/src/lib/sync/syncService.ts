import { writable } from "svelte/store";
import { apiClient } from "@logit/core/api/client";
import { syncApi, type RemoteProfile } from "@logit/core/api/syncApi";
import { getWorkoutRepo, getSplitRepo, getExerciseRepo } from "$lib/data/repoProvider";
import { isNativePlatform } from "$lib/platform/isNative";
import type { WorkoutSession } from "@logit/core/domain/workout";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { Exercise } from "@logit/core/domain/exercise";
import { enqueue, flush as flushOutbox } from "$lib/sync/outbox";

// ── localStorage keys ────────────────────────────────────────────────────────

const SESSIONS_LAST_PULLED_KEY = "logit:sync:sessionsLastPulledAt";
const SPLITS_LAST_PULLED_KEY = "logit:sync:splitsLastPulledAt";
const EXERCISES_LAST_PULLED_KEY = "logit:sync:exercisesLastPulledAt";
const PROFILE_UPDATED_AT_KEY = "logit:sync:profileUpdatedAtMs";

function getTimestamp(key: string): number {
  try { return parseInt(localStorage.getItem(key) ?? "0", 10) || 0; } catch { return 0; }
}
function setTimestamp(key: string, ms: number): void {
  try { localStorage.setItem(key, String(ms)); } catch {}
}

// ── Last synced ───────────────────────────────────────────────────────────────

const LAST_SYNCED_AT_KEY = "logit:sync:lastSyncedAt";

function getLastSyncedAtMs(): number {
  return getTimestamp(LAST_SYNCED_AT_KEY);
}

/** Reactive store — updates whenever a full sync completes. */
export const lastSyncedAt = writable(getLastSyncedAtMs());

// ── Sessions ─────────────────────────────────────────────────────────────────

export function pushSession(session: WorkoutSession): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = { id: session.id, startedAtMs: session.startedAtMs, dataJson: JSON.stringify(session) };
  syncApi.pushSessions([dto]).catch(() => enqueue({ type: "session", dto }));
}

export function pushDeletedSession(id: string): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = { id, startedAtMs: 0, dataJson: null, deletedAtMs: Date.now() };
  syncApi.pushSessions([dto]).catch(() => enqueue({ type: "session", dto }));
}

export async function pushAllSessions(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const repo = getWorkoutRepo();
    const all = await repo.listAllSessions();
    if (all.length === 0) return;
    const remote = all.map((s) => ({ id: s.id, startedAtMs: s.startedAtMs, dataJson: JSON.stringify(s) }));
    await syncApi.pushSessions(remote);
  } catch {}
}

export async function pullAndMergeSessions(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const since = getTimestamp(SESSIONS_LAST_PULLED_KEY);
    const { sessions: remote } = await syncApi.pullSessions(since);

    if (remote.length === 0) return;

    const repo = getWorkoutRepo();
    const existing = await repo.listAllSessions();
    const existingIds = new Set(existing.map((s) => s.id));

    for (const entry of remote) {
      if (entry.deletedAtMs) {
        if (existingIds.has(entry.id)) await repo.deleteSession(entry.id).catch(() => {});
        continue;
      }
      if (existingIds.has(entry.id)) continue;
      try {
        const session: WorkoutSession = JSON.parse(entry.dataJson!);
        await repo.saveSession(session);
      } catch {}
    }

    setTimestamp(SESSIONS_LAST_PULLED_KEY, Date.now());
  } catch {}
}

// ── Splits ────────────────────────────────────────────────────────────────────

export function pushSplit(split: WorkoutSplit): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = { id: split.id, updatedAtMs: split.updatedAtMs, dataJson: JSON.stringify(split) };
  syncApi.pushSplits([dto]).catch(() => enqueue({ type: "split", dto }));
}

export function pushDeletedSplit(id: string): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = { id, updatedAtMs: 0, dataJson: null, deletedAtMs: Date.now() };
  syncApi.pushSplits([dto]).catch(() => enqueue({ type: "split", dto }));
}

export async function pushAllSplits(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const repo = getSplitRepo();
    const all = await repo.getListSplits({ limit: 500, includeArchived: true });
    if (all.length === 0) return;
    const remote = all.map((s) => ({ id: s.id, updatedAtMs: s.updatedAtMs, dataJson: JSON.stringify(s) }));
    await syncApi.pushSplits(remote);
  } catch {}
}

export async function pullAndMergeSplits(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const since = getTimestamp(SPLITS_LAST_PULLED_KEY);
    const { splits: remote } = await syncApi.pullSplits(since);

    if (remote.length === 0) return;

    const repo = getSplitRepo();
    const existing = await repo.getListSplits({ limit: 1000, includeArchived: true });
    const localMap = new Map(existing.map((s) => [s.id, s.updatedAtMs]));

    for (const entry of remote) {
      if (entry.deletedAtMs) {
        if (localMap.has(entry.id)) await repo.deleteSplit(entry.id).catch(() => {});
        continue;
      }
      const localUpdatedAtMs = localMap.get(entry.id) ?? -1;
      if (entry.updatedAtMs <= localUpdatedAtMs) continue;
      try {
        const split: WorkoutSplit = JSON.parse(entry.dataJson!);
        await repo.saveSplit(split);
      } catch {}
    }

    setTimestamp(SPLITS_LAST_PULLED_KEY, Date.now());
  } catch {}
}

// ── Exercises ─────────────────────────────────────────────────────────────────

export function pushExercise(exercise: Exercise): void {
  if (!apiClient.isAuthenticated()) return;
  if (exercise.isCore) return;
  const dto = { id: exercise.id, createdAtMs: exercise.createdAtMs, dataJson: JSON.stringify(exercise) };
  syncApi.pushExercises([dto]).catch(() => enqueue({ type: "exercise", dto }));
}

export function pushDeletedExercise(id: string): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = { id, createdAtMs: 0, dataJson: null, deletedAtMs: Date.now() };
  syncApi.pushExercises([dto]).catch(() => enqueue({ type: "exercise", dto }));
}

export async function pushAllExercises(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const repo = getExerciseRepo();
    const all = await repo.list({ filter: "mine", limit: 1000 });
    if (all.length === 0) return;
    const remote = all.map((e) => ({ id: e.id, createdAtMs: e.createdAtMs, dataJson: JSON.stringify(e) }));
    await syncApi.pushExercises(remote);
  } catch {}
}

export async function pullAndMergeExercises(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const since = getTimestamp(EXERCISES_LAST_PULLED_KEY);
    const { exercises: remote } = await syncApi.pullExercises(since);

    if (remote.length === 0) return;

    const repo = getExerciseRepo();
    const existing = await repo.list({ filter: "all", limit: 2000 });
    const existingIds = new Set(existing.map((e) => e.id));

    for (const entry of remote) {
      if (entry.deletedAtMs) {
        if (existingIds.has(entry.id)) await repo.remove(entry.id).catch(() => {});
        continue;
      }
      if (existingIds.has(entry.id)) continue;
      try {
        const exercise: Exercise = JSON.parse(entry.dataJson!);
        await repo.saveExercise(exercise);
      } catch {}
    }

    setTimestamp(EXERCISES_LAST_PULLED_KEY, Date.now());
  } catch {}
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function getProfileUpdatedAtMs(): number {
  return getTimestamp(PROFILE_UPDATED_AT_KEY);
}

export function setProfileUpdatedAtMs(ms: number): void {
  setTimestamp(PROFILE_UPDATED_AT_KEY, ms);
}

export function pushProfile(remoteProfile: RemoteProfile): void {
  if (!apiClient.isAuthenticated()) return;
  syncApi.pushProfile(remoteProfile).catch(() => enqueue({ type: "profile", dto: remoteProfile }));
}

/** Called by navConfig.store when the user changes their nav layout. */
export async function pushNavConfig(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const { get } = await import("svelte/store");
    const [{ profile }, { getNavConfigJson }] = await Promise.all([
      import("$lib/stores/profile.store"),
      import("$lib/stores/navConfig.store"),
    ]);
    const p = get(profile);
    const updatedAtMs = Date.now();
    const remote: RemoteProfile = {
      displayName: p.name,
      bio: p.bio,
      avatarDataUrl: p.avatarDataUrl ?? null,
      height: p.height,
      heightUnit: p.heightUnit,
      weight: p.weight,
      weightUnit: p.weightUnit,
      blocksCollapsedByDefault: p.blocksCollapsedByDefault,
      restDefaultsJson: JSON.stringify(p.restDefaults),
      navConfigJson: getNavConfigJson(),
      updatedAtMs,
    };
    setProfileUpdatedAtMs(updatedAtMs);
    syncApi.pushProfile(remote).catch(() => enqueue({ type: "profile", dto: remote }));
  } catch {}
}

/**
 * Pushes every existing local record to the server, regardless of whether it's ever
 * been pushed before. Call this once whenever sync newly becomes available on a device
 * (login, register) — otherwise only records created/edited *after* that moment ever
 * reach the server, silently leaving pre-existing local history (the common case: a
 * user who's been logging offline and only later signs in) without a cloud copy at all.
 */
export async function pushAllLocalData(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  await Promise.all([pushAllSessions(), pushAllSplits(), pushAllExercises()]);
}

export async function syncAll(): Promise<void> {
  // Flush any writes queued while offline before pulling, so the server has the
  // latest local state before we merge its response back.
  await flushOutbox();
  await Promise.all([
    pullAndMergeSessions(),
    pullAndMergeSplits(),
    pullAndMergeExercises(),
    pullAndApplyProfile(),
  ]);
  const now = Date.now();
  setTimestamp(LAST_SYNCED_AT_KEY, now);
  lastSyncedAt.set(now);
}

export async function pullAndApplyProfile(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const { profile: remote } = await syncApi.pullProfile();
    if (!remote) return;

    const localUpdatedAtMs = getProfileUpdatedAtMs();
    if (remote.updatedAtMs <= localUpdatedAtMs) return;

    if (isNativePlatform()) {
      const { updateLocalAccount } = await import("$lib/data/localAccountRepo");
      const { getActiveOwnerId } = await import("$lib/data/activeOwner");
      const ownerId = getActiveOwnerId();
      if (ownerId) {
        await updateLocalAccount(ownerId, {
          displayName: remote.displayName,
          bio: remote.bio,
          avatarDataUrl: remote.avatarDataUrl ?? null,
          height: remote.height,
          heightUnit: remote.heightUnit,
          weight: remote.weight,
          weightUnit: remote.weightUnit,
          blocksCollapsedByDefault: remote.blocksCollapsedByDefault,
          restDefaultsJson: remote.restDefaultsJson,
        });
      }
    }

    if (remote.navConfigJson) {
      try {
        const { navConfig } = await import("$lib/stores/navConfig.store");
        navConfig.applyRemote(JSON.parse(remote.navConfigJson));
      } catch {}
    }

    let restDefaults: Record<string, number | undefined> = {};
    try { restDefaults = JSON.parse(remote.restDefaultsJson); } catch {}

    const { profile } = await import("$lib/stores/profile.store");
    profile.save({
      name: remote.displayName,
      bio: remote.bio,
      avatarDataUrl: remote.avatarDataUrl ?? undefined,
      height: remote.height,
      heightUnit: remote.heightUnit,
      weight: remote.weight,
      weightUnit: remote.weightUnit,
      blocksCollapsedByDefault: remote.blocksCollapsedByDefault,
      restDefaults,
    });

    setProfileUpdatedAtMs(remote.updatedAtMs);
  } catch {}
}
