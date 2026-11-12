import { syncApi } from "@logit/core/api/syncApi";
import type { RemoteSession, RemoteSplit, RemoteExercise, RemoteProfile } from "@logit/core/api/syncApi";
import { coachProgramApi, type UpsertCoachProgramInput } from "@logit/core/api/coachProgramApi";
import { checkinApi, type UpsertCheckinScheduleInput } from "@logit/core/api/checkinApi";
import { messagesApi, type SendMessageInput } from "@logit/core/api/messagesApi";
import type {
  RemoteCheckinSubmission,
  RemoteCustomFood,
  RemoteFavoriteFood,
  RemoteHabit,
  RemoteHabitEntry,
  RemoteMealTemplate,
  RemoteNutritionDay,
  RemoteNutritionGoal,
  RemoteRecipe,
  RemoteWeightEntry,
} from "@logit/core/api/syncApi";

import { syncStorageKey } from "$lib/sync/syncKeys";
import { log } from "@logit/core/platform/log";

// Per profile on the phone (see syncStorageKey). Before that existed this one key was shared
// by every profile; whichever profile first loads after the update adopts it, which is who
// it would have been sent as before.
const LEGACY_KEY = "logit:sync:outbox";

type OutboxEntry =
  | { type: "session"; dto: RemoteSession }
  | { type: "split"; dto: RemoteSplit }
  | { type: "exercise"; dto: RemoteExercise }
  | { type: "profile"; dto: RemoteProfile }
  | { type: "coachProgram"; dto: UpsertCoachProgramInput }
  | { type: "programStart"; dto: { programId: string; startedAtMs: number } }
  | { type: "checkinSchedule"; dto: UpsertCheckinScheduleInput }
  | { type: "checkinSubmission"; dto: RemoteCheckinSubmission }
  // No longer queued (an unsynced message is re-sent from the messages table); kept so
  // entries already in someone's outbox still get delivered.
  | { type: "coachMessage"; dto: SendMessageInput }
  | { type: "nutritionDay"; dto: RemoteNutritionDay }
  | { type: "customFood"; dto: RemoteCustomFood }
  | { type: "recipe"; dto: RemoteRecipe }
  | { type: "favoriteFood"; dto: RemoteFavoriteFood }
  | { type: "mealTemplate"; dto: RemoteMealTemplate }
  | { type: "weightEntry"; dto: RemoteWeightEntry }
  | { type: "nutritionGoal"; dto: RemoteNutritionGoal }
  | { type: "habit"; dto: RemoteHabit }
  | { type: "habitEntry"; dto: RemoteHabitEntry };

function key(): string {
  const k = syncStorageKey(LEGACY_KEY);
  if (k !== LEGACY_KEY) adoptLegacy(k);
  return k;
}

function adoptLegacy(k: string): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    const current = JSON.parse(localStorage.getItem(k) ?? "[]") as OutboxEntry[];
    localStorage.setItem(k, JSON.stringify([...(JSON.parse(legacy) as OutboxEntry[]), ...current]));
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    log.warn("sync", "Could not adopt the old shared outbox", e);
  }
}

function load(k: string = key()): OutboxEntry[] {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "[]");
  } catch (e) {
    log.error("sync", "Outbox unreadable, treating it as empty", e);
    return [];
  }
}

function save(entries: OutboxEntry[], k: string = key()): void {
  try {
    localStorage.setItem(k, JSON.stringify(entries));
  } catch (e) {
    // Most likely storage is full. These changes are still saved locally, but won't reach
    // the server until a full re-push (sign in again).
    log.error("sync", "Could not save the outbox; queued changes may not upload", {
      entries: entries.length,
      error: e,
    });
  }
}

/** How many changes are waiting to be sent. */
export function outboxSize(): number {
  return load().length;
}

/** Waiting changes per type, e.g. { session: 2, nutritionDay: 5 }. */
export function outboxSummary(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of load()) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

export function enqueue(entry: OutboxEntry): void {
  const entries = load();
  entries.push(entry);
  save(entries);
  log.debug("sync", `Queued ${entry.type} to send later`, { queued: entries.length });
}

/**
 * Send everything queued. Entries stay in storage until they've been sent: if the app is
 * closed mid-flush they're sent again next time, which is safe because every push is an
 * upsert (or, for messages and program starts, ignored when repeated). It used to empty the
 * queue first, so closing the app during a flush lost those writes.
 *
 * Only syncAll() calls this, one run at a time, so nothing else edits the queue meanwhile
 * except enqueue(), which only appends.
 */
export async function flush(): Promise<void> {
  // Fixed for the whole flush, so a profile switch mid-flush can't write to the wrong queue.
  const k = key();
  const entries = load(k);
  if (entries.length === 0) return;

  const sessions = entries.filter((e): e is Extract<OutboxEntry, { type: "session" }> => e.type === "session").map(e => e.dto);
  const splits = entries.filter((e): e is Extract<OutboxEntry, { type: "split" }> => e.type === "split").map(e => e.dto);
  const exercises = entries.filter((e): e is Extract<OutboxEntry, { type: "exercise" }> => e.type === "exercise").map(e => e.dto);
  // For profile, only the most recent write matters
  const profileEntries = entries.filter((e): e is Extract<OutboxEntry, { type: "profile" }> => e.type === "profile");
  const profile = profileEntries.at(-1)?.dto;
  // Coach programs / check-in schedules: collapse to the latest write per id (server LWW).
  const coachProgramMap = new Map<string, UpsertCoachProgramInput>();
  for (const e of entries) {
    if (e.type !== "coachProgram") continue;
    const prev = coachProgramMap.get(e.dto.programId);
    if (!prev || e.dto.updatedAtMs >= prev.updatedAtMs) coachProgramMap.set(e.dto.programId, e.dto);
  }
  // Program starts: the server keeps the first one, so the earliest queued per program is enough.
  const programStartMap = new Map<string, { programId: string; startedAtMs: number }>();
  for (const e of entries) {
    if (e.type !== "programStart") continue;
    if (!programStartMap.has(e.dto.programId)) programStartMap.set(e.dto.programId, e.dto);
  }
  const checkinScheduleMap = new Map<string, UpsertCheckinScheduleInput>();
  for (const e of entries) {
    if (e.type !== "checkinSchedule") continue;
    const prev = checkinScheduleMap.get(e.dto.scheduleId);
    if (!prev || e.dto.updatedAtMs >= prev.updatedAtMs) checkinScheduleMap.set(e.dto.scheduleId, e.dto);
  }
  const checkinSubmissions = entries
    .filter((e): e is Extract<OutboxEntry, { type: "checkinSubmission" }> => e.type === "checkinSubmission")
    .map((e) => e.dto);
  const coachMessages = entries
    .filter((e): e is Extract<OutboxEntry, { type: "coachMessage" }> => e.type === "coachMessage")
    .map((e) => e.dto);
  const nutritionDays = entries
    .filter((e): e is Extract<OutboxEntry, { type: "nutritionDay" }> => e.type === "nutritionDay")
    .map((e) => e.dto);
  const customFoods = entries
    .filter((e): e is Extract<OutboxEntry, { type: "customFood" }> => e.type === "customFood")
    .map((e) => e.dto);
  const recipes = entries
    .filter((e): e is Extract<OutboxEntry, { type: "recipe" }> => e.type === "recipe")
    .map((e) => e.dto);
  const favoriteFoods = entries
    .filter((e): e is Extract<OutboxEntry, { type: "favoriteFood" }> => e.type === "favoriteFood")
    .map((e) => e.dto);
  const mealTemplates = entries
    .filter((e): e is Extract<OutboxEntry, { type: "mealTemplate" }> => e.type === "mealTemplate")
    .map((e) => e.dto);
  const weightEntries = entries
    .filter((e): e is Extract<OutboxEntry, { type: "weightEntry" }> => e.type === "weightEntry")
    .map((e) => e.dto);
  const nutritionGoal = entries
    .filter((e): e is Extract<OutboxEntry, { type: "nutritionGoal" }> => e.type === "nutritionGoal")
    .map((e) => e.dto)
    .at(-1); // singleton — last write wins
  const habits = entries
    .filter((e): e is Extract<OutboxEntry, { type: "habit" }> => e.type === "habit")
    .map((e) => e.dto);
  const habitEntries = entries
    .filter((e): e is Extract<OutboxEntry, { type: "habitEntry" }> => e.type === "habitEntry")
    .map((e) => e.dto);

  const failed: OutboxEntry[] = [];

  if (sessions.length) {
    try { await syncApi.pushSessions(sessions); }
    catch { sessions.forEach(dto => failed.push({ type: "session", dto })); }
  }
  if (splits.length) {
    try { await syncApi.pushSplits(splits); }
    catch { splits.forEach(dto => failed.push({ type: "split", dto })); }
  }
  if (exercises.length) {
    try { await syncApi.pushExercises(exercises); }
    catch { exercises.forEach(dto => failed.push({ type: "exercise", dto })); }
  }
  if (profile) {
    try { await syncApi.pushProfile(profile); }
    catch { failed.push({ type: "profile", dto: profile }); }
  }
  for (const dto of coachProgramMap.values()) {
    try { await coachProgramApi.upsert(dto); }
    catch { failed.push({ type: "coachProgram", dto }); }
  }
  for (const dto of programStartMap.values()) {
    try { await coachProgramApi.startAssigned(dto.programId, dto.startedAtMs); }
    catch { failed.push({ type: "programStart", dto }); }
  }
  for (const dto of checkinScheduleMap.values()) {
    try { await checkinApi.upsert(dto); }
    catch { failed.push({ type: "checkinSchedule", dto }); }
  }
  if (checkinSubmissions.length) {
    try { await syncApi.pushCheckinSubmissions(checkinSubmissions); }
    catch { checkinSubmissions.forEach((dto) => failed.push({ type: "checkinSubmission", dto })); }
  }
  for (const dto of coachMessages) {
    try { await messagesApi.send(dto); }
    catch { failed.push({ type: "coachMessage", dto }); }
  }
  if (nutritionDays.length) {
    try { await syncApi.pushNutritionDays(nutritionDays); }
    catch { nutritionDays.forEach((dto) => failed.push({ type: "nutritionDay", dto })); }
  }
  if (customFoods.length) {
    try { await syncApi.pushCustomFoods(customFoods); }
    catch { customFoods.forEach((dto) => failed.push({ type: "customFood", dto })); }
  }
  if (recipes.length) {
    try { await syncApi.pushRecipes(recipes); }
    catch { recipes.forEach((dto) => failed.push({ type: "recipe", dto })); }
  }
  if (favoriteFoods.length) {
    try { await syncApi.pushFavorites(favoriteFoods); }
    catch { favoriteFoods.forEach((dto) => failed.push({ type: "favoriteFood", dto })); }
  }
  if (mealTemplates.length) {
    try { await syncApi.pushMealTemplates(mealTemplates); }
    catch { mealTemplates.forEach((dto) => failed.push({ type: "mealTemplate", dto })); }
  }
  if (weightEntries.length) {
    try { await syncApi.pushWeightEntries(weightEntries); }
    catch { weightEntries.forEach((dto) => failed.push({ type: "weightEntry", dto })); }
  }
  if (nutritionGoal) {
    try { await syncApi.pushNutritionGoal(nutritionGoal); }
    catch { failed.push({ type: "nutritionGoal", dto: nutritionGoal }); }
  }
  if (habits.length) {
    try { await syncApi.pushHabits(habits); }
    catch { habits.forEach((dto) => failed.push({ type: "habit", dto })); }
  }
  if (habitEntries.length) {
    try { await syncApi.pushHabitEntries(habitEntries); }
    catch { habitEntries.forEach((dto) => failed.push({ type: "habitEntry", dto })); }
  }

  // Drop what was sent: keep the failures (first, so they retry first) and anything queued
  // while sending, which enqueue() appended after the entries this flush started with.
  const newer = load(k).slice(entries.length);
  save([...failed, ...newer], k);

  if (failed.length === 0) {
    log.info("sync", "Sent queued changes", { sent: entries.length });
  } else {
    const types = [...new Set(failed.map((f) => f.type))];
    log.warn("sync", "Some queued changes could not be sent; will retry", {
      queued: entries.length,
      stillQueued: failed.length,
      types,
    });
  }
}
