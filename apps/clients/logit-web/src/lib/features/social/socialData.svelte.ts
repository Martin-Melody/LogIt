import { notificationsApi } from "@logit/core/api/socialApi";
import { apiClient } from "@logit/core/api/client";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { getExercises } from "@logit/core/domain/workout";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { Habit } from "@logit/core/domain/habit";
import { historyPRs, sessionTitle } from "@logit/core/domain/sessionHistory";
import { logitEntries, type LibraryEntry, type LibraryItem } from "@logit/core/domain/library";
import {
  habitFromShared,
  libraryItemFromShared,
  sharedHabit,
  sharedLibraryItem,
  sharedSplit,
  splitFromShared,
  type SharedExercise,
  type SharedHabit,
  type SharedLibraryItem,
  type SharedSplit,
} from "@logit/core/domain/sharedContent";
import { getWebDeps } from "$lib/deps";
import { loadWebLibrary, saveLibraryItem } from "$lib/features/library/libraryData";
import { loadSplits, saveSplit } from "$lib/features/plan/splits";
import { loadHabits, saveHabit } from "$lib/features/habitsGoals/habitsData";

/** Who's signed in on this browser (for "is this my post?"). */
export function me(): { id: string; username: string } | null {
  const u = apiClient.getUser();
  return u ? { id: u.id, username: u.username } : null;
}

/** "2 h", "yesterday", "3 d", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ── The unread badge ──────────────────────────────────────────────────────────

const unread = $state({ count: 0 });
let lastUnread = 0;

export const socialBadge = {
  get count() { return unread.count; },
  set(n: number) { unread.count = n; },
  /** At most every 30 s unless forced. Never throws. */
  async refresh(force = false) {
    if (!force && Date.now() - lastUnread < 30_000) return;
    lastUnread = Date.now();
    try {
      unread.count = await notificationsApi.unreadCount();
    } catch {
      /* keep it */
    }
  },
};

// ── What you can attach ───────────────────────────────────────────────────────

export type PrChoice = { exerciseName: string; weight: number; reps: number; atMs: number };

export type ComposerSources = {
  sessions: { session: WorkoutSession; title: string }[];
  prs: PrChoice[];
  splits: WorkoutSplit[];
  library: LibraryEntry[];
  habits: Habit[];
};

/** Your recent sessions, PRs, splits, own library items and habits (all synced data). */
export async function loadComposerSources(): Promise<ComposerSources> {
  const [all, splits, lib, habits] = await Promise.all([
    getWebDeps().workoutRepo.listAllSessions().catch(() => [] as WorkoutSession[]),
    loadSplits().catch(() => [] as WorkoutSplit[]),
    loadWebLibrary().catch(() => null),
    loadHabits().then((h) => h.habits).catch(() => [] as Habit[]),
  ]);
  const sessions = all.filter((s) => s.endedAtMs != null).sort((a, b) => b.startedAtMs - a.startedAtMs);
  const prMap = historyPRs(sessions);
  const prs: PrChoice[] = [];
  for (const s of sessions) {
    for (const pr of prMap.get(s.id) ?? []) prs.push({ exerciseName: pr.exerciseName, weight: pr.weight, reps: pr.reps, atMs: s.startedAtMs });
    if (prs.length >= 30) break;
  }
  return {
    sessions: sessions.slice(0, 30).map((session) => ({ session, title: sessionTitle(session) })),
    prs,
    splits: splits.filter((s) => !s.archived),
    library: lib?.own ?? [],
    habits,
  };
}

export function workoutPayload(s: WorkoutSession): string {
  const exs = getExercises(s);
  return JSON.stringify({
    duration: s.endedAtMs ? s.endedAtMs - s.startedAtMs : 0,
    exercises: exs.map((ex) => ({ name: ex.exerciseName, sets: ex.sets.length })),
  });
}

export function prPayload(pr: PrChoice): string {
  return JSON.stringify({ exerciseName: pr.exerciseName, weight: pr.weight, unit: "kg", reps: pr.reps });
}

const CORE_IDS = new Set(logitEntries("strength").map((e) => e.item.id));

/** A split as a post, with full definitions of the exercises in it that are yours (LogIt's
 * have the same id everywhere). */
export function splitPayload(split: WorkoutSplit, own: LibraryEntry[]): string {
  const custom = new Map<string, SharedExercise>();
  for (const day of split.days) {
    for (const b of day.blocks) {
      if (b.type !== "strength" || (b.exerciseId && CORE_IDS.has(b.exerciseId))) continue;
      const mine = own.find((e) => e.kind === "strength" &&
        (e.item.id === b.exerciseId || e.item.name.trim().toLowerCase() === b.exerciseName.trim().toLowerCase()));
      if (mine) custom.set(mine.item.name, sharedLibraryItem(mine) as SharedExercise);
    }
  }
  return JSON.stringify(sharedSplit(split, [...custom.values()]));
}

export function libraryPayload(entry: LibraryItem): string {
  return JSON.stringify(sharedLibraryItem(entry));
}

export function habitPayload(h: Habit): string {
  return JSON.stringify(sharedHabit(h));
}

// ── Copy to mine ──────────────────────────────────────────────────────────────

export type CopyResult = { message: string; href: string };

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function copySplit(p: SharedSplit): Promise<CopyResult> {
  const lib = await loadWebLibrary();
  const added: string[] = [];
  const split = await splitFromShared(p, async (name, sourceId, custom) => {
    if (sourceId && CORE_IDS.has(sourceId)) return sourceId;
    const have = lib.entries.find((e) => e.kind === "strength" && sameName(e.item.name, name));
    if (have) return have.item.id;
    if (!custom) return undefined;
    const item = libraryItemFromShared(custom);
    await saveLibraryItem(item);
    added.push(item.item.name);
    return item.item.id;
  });
  await saveSplit(split, null);
  const extra = added.length ? ` ${added.join(", ")} ${added.length === 1 ? "was" : "were"} added to your library.` : "";
  return { message: `Copied as "${split.name}".${extra}`, href: `/plan?id=${split.id}` };
}

export async function copyLibrary(p: SharedLibraryItem): Promise<CopyResult> {
  const item = libraryItemFromShared(p);
  const lib = await loadWebLibrary();
  const have = lib.own.find((e) => e.kind === item.kind && sameName(e.item.name, item.item.name));
  const kindParam = item.kind === "strength" ? "" : `kind=${item.kind}&`;
  if (have) return { message: `You already have "${have.item.name}".`, href: `/library?${kindParam}id=${have.item.id}` };
  await saveLibraryItem(item);
  return { message: `"${item.item.name}" is in your library.`, href: `/library?${kindParam}id=${item.item.id}` };
}

export async function copyHabit(p: SharedHabit): Promise<CopyResult> {
  const h = habitFromShared(p);
  await saveHabit(h);
  return { message: `"${h.name}" is in your habits.`, href: "/habits" };
}
