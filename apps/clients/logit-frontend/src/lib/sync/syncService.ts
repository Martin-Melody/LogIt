import { writable } from "svelte/store";
import { apiClient } from "@logit/core/api/client";
import { syncApi, type RemoteProfile } from "@logit/core/api/syncApi";
import { coachProgramApi } from "@logit/core/api/coachProgramApi";
import { coachNutritionPlanApi } from "@logit/core/api/coachNutritionPlanApi";
import { coachHabitApi } from "@logit/core/api/coachHabitApi";
import { checkinApi } from "@logit/core/api/checkinApi";
import { messagesApi } from "@logit/core/api/messagesApi";
import {
  getWorkoutRepo,
  getSplitRepo,
  getExerciseRepo,
  getCoachProgramRepo,
  getAuthoredProgramRepo,
  getCheckinRepo,
  getAuthoredCheckinRepo,
  getMessagesRepo,
  getNutritionRepo,
  getCoachNutritionPlanRepo,
  getHabitRepo,
  getAssignedHabitRepo,
} from "$lib/data/repoProvider";
import { isNativePlatform } from "$lib/platform/isNative";
import type { WorkoutSession } from "@logit/core/domain/workout";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";
import type { CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
import type { CheckinSchedule, CheckinSubmission } from "@logit/core/domain/Checkin";
import type { CoachMessage } from "@logit/core/domain/CoachMessage";
import type { Exercise } from "@logit/core/domain/exercise";
import type {
  CustomFood,
  DiaryDay,
  FavoriteFood,
  MealTemplate,
  NutritionGoal,
  Recipe,
  WeightEntry,
} from "@logit/core/domain/nutrition";
import { favoriteFoodId } from "@logit/core/domain/nutrition";
import type { Habit, HabitEntry } from "@logit/core/domain/habit";
import type { CoachHabit } from "@logit/core/domain/CoachHabit";
import { enqueue, flush as flushOutbox, outboxSize } from "$lib/sync/outbox";
import { syncStorageKey } from "$lib/sync/syncKeys";
import { singleFlight } from "$lib/sync/singleFlight";
import { log } from "@logit/core/platform/log";

/** A sync step that failed and was skipped. API failures are also logged by the API client
 * with their status and request id; this says which step they broke. */
function syncWarn(step: string, e: unknown): void {
  log.warn("sync", `${step} failed`, e);
}

// ── localStorage keys ────────────────────────────────────────────────────────

const SESSIONS_LAST_PULLED_KEY = "logit:sync:sessionsLastPulledAt";
const SPLITS_LAST_PULLED_KEY = "logit:sync:splitsLastPulledAt";
const EXERCISES_LAST_PULLED_KEY = "logit:sync:exercisesLastPulledAt";
const COACH_PROGRAMS_LAST_PULLED_KEY = "logit:sync:coachProgramsLastPulledAt";
const COACH_NUTRITION_PLANS_LAST_PULLED_KEY = "logit:sync:coachNutritionPlansLastPulledAt";
const CHECKIN_SCHEDULES_LAST_PULLED_KEY = "logit:sync:checkinSchedulesLastPulledAt";
const CHECKIN_SUBMISSIONS_LAST_PULLED_KEY = "logit:sync:checkinSubmissionsLastPulledAt";
const MESSAGES_LAST_PULLED_KEY = "logit:sync:messagesLastPulledAt";
const PROFILE_UPDATED_AT_KEY = "logit:sync:profileUpdatedAtMs";
const NUTRITION_DAYS_LAST_PULLED_KEY = "logit:sync:nutritionDaysLastPulledAt";
const CUSTOM_FOODS_LAST_PULLED_KEY = "logit:sync:customFoodsLastPulledAt";
const RECIPES_LAST_PULLED_KEY = "logit:sync:recipesLastPulledAt";
const FAVORITES_LAST_PULLED_KEY = "logit:sync:favoritesLastPulledAt";
const MEAL_TEMPLATES_LAST_PULLED_KEY = "logit:sync:mealTemplatesLastPulledAt";
const WEIGHT_ENTRIES_LAST_PULLED_KEY = "logit:sync:weightEntriesLastPulledAt";
const HABITS_LAST_PULLED_KEY = "logit:sync:habitsLastPulledAt";
const HABIT_ENTRIES_LAST_PULLED_KEY = "logit:sync:habitEntriesLastPulledAt";
const COACH_HABITS_LAST_PULLED_KEY = "logit:sync:coachHabitsLastPulledAt";

// Every key below is per profile on the phone; see syncStorageKey.
function getTimestamp(key: string): number {
  try { return parseInt(localStorage.getItem(syncStorageKey(key)) ?? "0", 10) || 0; } catch { return 0; }
}
function setTimestamp(key: string, ms: number): void {
  try { localStorage.setItem(syncStorageKey(key), String(ms)); } catch (e) { syncWarn("setTimestamp", e); }
}

// ── Last synced ───────────────────────────────────────────────────────────────

const LAST_SYNCED_AT_KEY = "logit:sync:lastSyncedAt";

function getLastSyncedAtMs(): number {
  return getTimestamp(LAST_SYNCED_AT_KEY);
}

/** Reactive store — updates whenever a full sync completes, and on a profile switch. */
export const lastSyncedAt = writable(getLastSyncedAtMs());

/** Re-read the active profile's last-synced time (call after the active profile changes). */
export function reloadLastSyncedAt(): void {
  lastSyncedAt.set(getLastSyncedAtMs());
}

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
  } catch (e) { syncWarn("pushAllSessions", e); }
}

/** Returns false when the pull itself failed (network/auth rejection) — syncAll() uses this
 * to decide whether it's honest to report the sync as having succeeded. A per-item merge
 * hiccup below is not a pull failure and stays non-fatal. */
export async function pullAndMergeSessions(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(SESSIONS_LAST_PULLED_KEY);
    const { sessions: remote } = await syncApi.pullSessions(since);

    if (remote.length === 0) return true;

    const repo = getWorkoutRepo();
    const existing = await repo.listAllSessions();
    const existingIds = new Set(existing.map((s) => s.id));

    for (const entry of remote) {
      if (entry.deletedAtMs) {
        if (existingIds.has(entry.id)) await repo.deleteSession(entry.id).catch((e) => syncWarn("pullAndMergeSessions", e));
        continue;
      }
      if (existingIds.has(entry.id)) continue;
      try {
        const session: WorkoutSession = JSON.parse(entry.dataJson!);
        await repo.saveSession(session);
      } catch (e) { syncWarn("pullAndMergeSessions", e); }
    }

    setTimestamp(SESSIONS_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeSessions", e);
    return false;
  }
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
    // getListSplits() is a lightweight index for list screens — it returns each day with
    // blocks hardcoded to [] rather than querying planned_blocks, deliberately, to avoid
    // loading full split data just to show a day count (see its own comment in
    // splitRepo.sqlite.ts). Pushing that stub straight to JSON — as this function used to —
    // wipes every day's exercises server-side on every single login, since pushAllLocalData()
    // runs this unconditionally. exportData.ts already does this correctly: use the list only
    // for the id, then getSplit(id) for the real, fully-populated object.
    const stubs = await repo.getListSplits({ limit: 500, includeArchived: true });
    if (stubs.length === 0) return;
    const full = await Promise.all(stubs.map((s) => repo.getSplit(s.id)));
    const remote = full
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({ id: s.id, updatedAtMs: s.updatedAtMs, dataJson: JSON.stringify(s) }));
    await syncApi.pushSplits(remote);
  } catch (e) { syncWarn("pushAllSplits", e); }
}

export async function pullAndMergeSplits(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(SPLITS_LAST_PULLED_KEY);
    const { splits: remote } = await syncApi.pullSplits(since);

    if (remote.length === 0) return true;

    const repo = getSplitRepo();
    const existing = await repo.getListSplits({ limit: 1000, includeArchived: true });
    const localMap = new Map(existing.map((s) => [s.id, s.updatedAtMs]));

    for (const entry of remote) {
      if (entry.deletedAtMs) {
        if (localMap.has(entry.id)) await repo.deleteSplit(entry.id).catch((e) => syncWarn("pullAndMergeSplits", e));
        continue;
      }
      const localUpdatedAtMs = localMap.get(entry.id) ?? -1;
      if (entry.updatedAtMs <= localUpdatedAtMs) continue;
      try {
        const split: WorkoutSplit = JSON.parse(entry.dataJson!);
        await repo.saveSplit(split);
      } catch (e) { syncWarn("pullAndMergeSplits", e); }
    }

    setTimestamp(SPLITS_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeSplits", e);
    return false;
  }
}

// ── Exercises ─────────────────────────────────────────────────────────────────

export function pushExercise(exercise: Exercise): void {
  if (!apiClient.isAuthenticated()) return;
  if (exercise.isCore) return;
  // Exercise-pack items are re-installable plugin content, not user data.
  if (exercise.id.startsWith("pack:")) return;
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
  } catch (e) { syncWarn("pushAllExercises", e); }
}

export async function pullAndMergeExercises(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(EXERCISES_LAST_PULLED_KEY);
    const { exercises: remote } = await syncApi.pullExercises(since);

    if (remote.length === 0) return true;

    const repo = getExerciseRepo();
    const existing = await repo.list({ filter: "all", limit: 2000 });
    const existingIds = new Set(existing.map((e) => e.id));

    for (const entry of remote) {
      if (entry.deletedAtMs) {
        if (existingIds.has(entry.id)) await repo.remove(entry.id).catch((e) => syncWarn("pullAndMergeExercises", e));
        continue;
      }
      if (existingIds.has(entry.id)) continue;
      try {
        const exercise: Exercise = JSON.parse(entry.dataJson!);
        await repo.saveExercise(exercise);
      } catch (e) { syncWarn("pullAndMergeExercises", e); }
    }

    setTimestamp(EXERCISES_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeExercises", e);
    return false;
  }
}

// ── Coach programs (read-only mirror) ─────────────────────────────────────────

/** Pull programs a coach has assigned to this account into the local read-only mirror.
 * One-directional: the user never edits these, so there's no push counterpart here. */
export async function pullAndMergeCoachPrograms(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(COACH_PROGRAMS_LAST_PULLED_KEY);
    const remote = await coachProgramApi.pullAssigned(since);
    if (remote.length === 0) {
      setTimestamp(COACH_PROGRAMS_LAST_PULLED_KEY, Date.now());
      return true;
    }

    const repo = getCoachProgramRepo();
    for (const entry of remote) {
      if (entry.deletedAtMs || !entry.dataJson) {
        await repo.removeFromRemote(entry.programId).catch((e) => syncWarn("pullAndMergeCoachPrograms", e));
        continue;
      }
      try {
        const program = JSON.parse(entry.dataJson) as CoachProgram;
        const existing = await repo.getAssignedProgram(program.id);
        // The client's Start lives outside the coach's data. Keep a local start the server
        // hasn't confirmed yet (it's queued in the outbox) rather than wiping it.
        const clientStartedAtMs = entry.startedAtMs ?? existing?.clientStartedAtMs;
        // The coach is the sole writer of everything else, so last-write-wins on updatedAtMs.
        // A newer start alone (from the client's other device) also counts as a change.
        const coachChanged = !existing || program.updatedAtMs > existing.updatedAtMs;
        const startChanged = existing?.clientStartedAtMs !== clientStartedAtMs;
        if (!coachChanged && !startChanged) continue;
        const base = coachChanged ? program : existing!;
        await repo.upsertFromRemote({ ...base, clientStartedAtMs: clientStartedAtMs ?? undefined });
      } catch (e) { syncWarn("pullAndMergeCoachPrograms", e); }
    }

    setTimestamp(COACH_PROGRAMS_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeCoachPrograms", e);
    return false;
  }
}

/** Send the client's Start for an assigned program, queueing it if offline. The server keeps
 * the first start it sees and replies with it; that value is saved locally. */
export function pushProgramStart(programId: string, startedAtMs: number): void {
  if (!apiClient.isAuthenticated()) return;
  coachProgramApi
    .startAssigned(programId, startedAtMs)
    .then(async (res) => {
      if (res.startedAtMs === startedAtMs) return;
      const repo = getCoachProgramRepo();
      const program = await repo.getAssignedProgram(programId);
      if (program) await repo.upsertFromRemote({ ...program, clientStartedAtMs: res.startedAtMs });
    })
    .catch(() => enqueue({ type: "programStart", dto: { programId, startedAtMs } }));
}

/** Pull the nutrition plan(s) a coach has assigned into the local read-only mirror. */
export async function pullAndMergeCoachNutritionPlan(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(COACH_NUTRITION_PLANS_LAST_PULLED_KEY);
    const remote = await coachNutritionPlanApi.pullAssigned(since);
    if (remote.length === 0) {
      setTimestamp(COACH_NUTRITION_PLANS_LAST_PULLED_KEY, Date.now());
      return true;
    }
    const repo = getCoachNutritionPlanRepo();
    for (const entry of remote) {
      if (entry.deletedAtMs || !entry.dataJson) {
        await repo.removeFromRemote(entry.planId).catch((e) => syncWarn("pullAndMergeCoachNutritionPlan", e));
        continue;
      }
      try {
        await repo.upsertFromRemote(JSON.parse(entry.dataJson) as CoachNutritionPlan);
      } catch (e) { syncWarn("pullAndMergeCoachNutritionPlan", e); }
    }
    setTimestamp(COACH_NUTRITION_PLANS_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeCoachNutritionPlan", e);
    return false;
  }
}

// ── Coach programs (authoring — push) ────────────────────────────────────────

/** Push one authored program to the server, queueing it for retry if offline. Called by the
 * saveAuthoredProgram / deleteAuthoredProgram usecases, mirroring pushSplit. */
export function pushCoachProgram(
  program: CoachProgram,
  recipientUsername: string | null,
  deleted = false,
): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = {
    programId: program.id,
    dataJson: deleted ? "" : JSON.stringify(program),
    updatedAtMs: program.updatedAtMs,
    recipientUsername: recipientUsername ?? undefined,
    deletedAtMs: deleted ? Date.now() : undefined,
  };
  coachProgramApi.upsert(dto).catch(() => enqueue({ type: "coachProgram", dto }));
}

/** Re-push every locally authored program — call once when sync newly becomes available
 * (login/register), same rationale as pushAllLocalData. */
export async function pushAllAuthoredPrograms(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const rows = await getAuthoredProgramRepo().listForPush();
    for (const { program, recipientUsername } of rows) {
      await coachProgramApi
        .upsert({
          programId: program.id,
          dataJson: JSON.stringify(program),
          updatedAtMs: program.updatedAtMs,
          recipientUsername: recipientUsername ?? undefined,
        })
        .catch((e) => syncWarn("pushAllAuthoredPrograms", e));
    }
  } catch (e) { syncWarn("pushAllAuthoredPrograms", e); }
}

// ── Check-ins ────────────────────────────────────────────────────────────────

/** Pull coach check-in schedules into the local read-only mirror (like coach programs). */
export async function pullAndMergeCheckinSchedules(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(CHECKIN_SCHEDULES_LAST_PULLED_KEY);
    const remote = await checkinApi.pullAssigned(since);
    const repo = getCheckinRepo();
    for (const entry of remote) {
      if (entry.deletedAtMs || !entry.dataJson) {
        await repo.removeScheduleFromRemote(entry.scheduleId).catch((e) => syncWarn("pullAndMergeCheckinSchedules", e));
        continue;
      }
      try {
        const schedule = JSON.parse(entry.dataJson) as CheckinSchedule;
        const existing = await repo.getAssignedSchedule(schedule.id);
        if (existing && existing.updatedAtMs >= schedule.updatedAtMs) continue;
        await repo.upsertScheduleFromRemote(schedule);
      } catch (e) { syncWarn("pullAndMergeCheckinSchedules", e); }
    }
    setTimestamp(CHECKIN_SCHEDULES_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeCheckinSchedules", e);
    return false;
  }
}

/** Pull this account's own check-in submissions back (multi-device), like sessions. */
export async function pullAndMergeCheckinSubmissions(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(CHECKIN_SUBMISSIONS_LAST_PULLED_KEY);
    const { submissions } = await syncApi.pullCheckinSubmissions(since);
    const repo = getCheckinRepo();
    for (const entry of submissions) {
      if (entry.deletedAtMs || !entry.dataJson) {
        await repo.removeSubmissionFromRemote(entry.id).catch((e) => syncWarn("pullAndMergeCheckinSubmissions", e));
        continue;
      }
      try {
        const sub = JSON.parse(entry.dataJson) as CheckinSubmission;
        const existing = await repo.getSubmission(sub.id);
        if (existing && existing.updatedAtMs >= sub.updatedAtMs) continue;
        await repo.upsertSubmissionFromRemote(sub);
      } catch (e) { syncWarn("pullAndMergeCheckinSubmissions", e); }
    }
    setTimestamp(CHECKIN_SUBMISSIONS_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeCheckinSubmissions", e);
    return false;
  }
}

export function pushCheckinSubmission(sub: CheckinSubmission, deleted = false): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = {
    id: sub.id,
    createdAtMs: sub.createdAtMs,
    updatedAtMs: sub.updatedAtMs,
    dataJson: deleted ? null : JSON.stringify(sub),
    deletedAtMs: deleted ? Date.now() : undefined,
  };
  syncApi.pushCheckinSubmissions([dto]).catch(() => enqueue({ type: "checkinSubmission", dto }));
}

export async function pushAllCheckinSubmissions(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const subs = await getCheckinRepo().listSubmissionsForPush();
    if (subs.length === 0) return;
    await syncApi.pushCheckinSubmissions(
      subs.map((s) => ({ id: s.id, createdAtMs: s.createdAtMs, updatedAtMs: s.updatedAtMs, dataJson: JSON.stringify(s) })),
    );
  } catch (e) { syncWarn("pushAllCheckinSubmissions", e); }
}

/** Coach authoring: push one check-in schedule, queued if offline (mirrors pushCoachProgram). */
export function pushCheckinSchedule(
  schedule: CheckinSchedule,
  recipientUsername: string | null,
  deleted = false,
): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = {
    scheduleId: schedule.id,
    dataJson: deleted ? "" : JSON.stringify(schedule),
    updatedAtMs: schedule.updatedAtMs,
    recipientUsername: recipientUsername ?? undefined,
    deletedAtMs: deleted ? Date.now() : undefined,
  };
  checkinApi.upsert(dto).catch(() => enqueue({ type: "checkinSchedule", dto }));
}

export async function pushAllAuthoredCheckinSchedules(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const rows = await getAuthoredCheckinRepo().listForPush();
    for (const { schedule, recipientUsername } of rows) {
      await checkinApi
        .upsert({
          scheduleId: schedule.id,
          dataJson: JSON.stringify(schedule),
          updatedAtMs: schedule.updatedAtMs,
          recipientUsername: recipientUsername ?? undefined,
        })
        .catch((e) => syncWarn("pushAllAuthoredCheckinSchedules", e));
    }
  } catch (e) { syncWarn("pushAllAuthoredCheckinSchedules", e); }
}

// ── Messaging ────────────────────────────────────────────────────────────────

/** Pull every message across all active threads into the local mirror. */
export async function pullAndMergeMessages(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(MESSAGES_LAST_PULLED_KEY);
    const remote = await messagesApi.listAll(since);
    const repo = getMessagesRepo();
    for (const m of remote) {
      await repo.upsertFromRemote({
        id: m.messageId,
        relationshipId: m.relationshipId,
        body: m.body,
        createdAtMs: m.createdAtMs,
        readAtMs: m.readAtMs,
        mine: m.mine,
        synced: true,
        contextDateIso: m.contextDateIso ?? undefined,
      });
    }
    setTimestamp(MESSAGES_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeMessages", e);
    return false;
  }
}

/** Send one message: optimistic local insert already done by the caller; this pushes it. */
export function pushMessage(message: CoachMessage): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = {
    relationshipId: message.relationshipId,
    messageId: message.id,
    body: message.body,
    createdAtMs: message.createdAtMs,
    contextDateIso: message.contextDateIso,
  };
  // On failure the message just stays unsynced locally: that flag is its queue, and the next
  // sync re-sends it (pushPendingMessages). It used to also go into the outbox, which sent it
  // without ever marking it synced.
  messagesApi
    .send(dto)
    .then(() => getMessagesRepo().markSynced(message.id))
    .catch((e) => syncWarn("pushMessage", e));
}

export async function pushPendingMessages(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const repo = getMessagesRepo();
    const pending = await repo.pendingOutgoing();
    for (const m of pending) {
      try {
        await messagesApi.send({
          relationshipId: m.relationshipId,
          messageId: m.id,
          body: m.body,
          createdAtMs: m.createdAtMs,
          contextDateIso: m.contextDateIso,
        });
        await repo.markSynced(m.id);
      } catch (e) { syncWarn("pushPendingMessages", e); }
    }
  } catch (e) { syncWarn("pushPendingMessages", e); }
}

/** Mark the other party's messages in a thread read, locally and on the server. */
export async function markThreadRead(relationshipId: string, upToMs: number): Promise<void> {
  try {
    await getMessagesRepo().markThreadRead(relationshipId, upToMs);
  } catch (e) { syncWarn("markThreadRead", e); }
  if (apiClient.isAuthenticated()) {
    messagesApi.markRead(relationshipId, upToMs).catch((e) => syncWarn("markThreadRead", e));
  }
}

// ── Nutrition ────────────────────────────────────────────────────────────────
// Diary days, custom foods, recipes and weight entries all sync like check-in
// submissions (client-owned, LWW by updatedAtMs, tombstoned). The goal is a singleton
// blob. Deletions ride along in the blob (deletedAtMs) rather than a separate signal.

type NutritionRow = { createdAtMs: number; updatedAtMs: number; deletedAtMs?: number };

function nutritionRowDto(id: string, row: NutritionRow) {
  return {
    id,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    dataJson: row.deletedAtMs ? null : JSON.stringify(row),
    deletedAtMs: row.deletedAtMs,
  };
}

export function pushNutritionDay(day: DiaryDay): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = nutritionRowDto(day.id, day);
  syncApi.pushNutritionDays([dto]).catch(() => enqueue({ type: "nutritionDay", dto }));
}

export function pushCustomFood(food: CustomFood): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = nutritionRowDto(food.food.id, food);
  syncApi.pushCustomFoods([dto]).catch(() => enqueue({ type: "customFood", dto }));
}

export function pushRecipe(recipe: Recipe): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = nutritionRowDto(recipe.id, recipe);
  syncApi.pushRecipes([dto]).catch(() => enqueue({ type: "recipe", dto }));
}

export function pushFavorite(fav: FavoriteFood): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = nutritionRowDto(favoriteFoodId(fav.food.id), fav);
  syncApi.pushFavorites([dto]).catch(() => enqueue({ type: "favoriteFood", dto }));
}

export function pushMealTemplate(t: MealTemplate): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = nutritionRowDto(t.id, t);
  syncApi.pushMealTemplates([dto]).catch(() => enqueue({ type: "mealTemplate", dto }));
}

export function pushWeightEntry(entry: WeightEntry): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = nutritionRowDto(entry.id, entry);
  syncApi.pushWeightEntries([dto]).catch(() => enqueue({ type: "weightEntry", dto }));
}

export function pushNutritionGoal(goal: NutritionGoal): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = { dataJson: JSON.stringify(goal), updatedAtMs: goal.updatedAtMs };
  syncApi.pushNutritionGoal(dto).catch(() => enqueue({ type: "nutritionGoal", dto }));
}

/** Push every local nutrition record — called once when sync newly becomes available. */
export async function pushAllNutrition(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const repo = getNutritionRepo();
    const [days, foods, recipes, favorites, templates, weights, goal] = await Promise.all([
      repo.listDaysForPush(),
      repo.listCustomFoodsForPush(),
      repo.listRecipesForPush(),
      repo.listFavoritesForPush(),
      repo.listMealTemplatesForPush(),
      repo.listWeightEntriesForPush(),
      repo.getGoal(),
    ]);
    if (days.length) await syncApi.pushNutritionDays(days.map((d) => nutritionRowDto(d.id, d)));
    if (foods.length) await syncApi.pushCustomFoods(foods.map((f) => nutritionRowDto(f.food.id, f)));
    if (recipes.length) await syncApi.pushRecipes(recipes.map((r) => nutritionRowDto(r.id, r)));
    if (favorites.length)
      await syncApi.pushFavorites(favorites.map((f) => nutritionRowDto(favoriteFoodId(f.food.id), f)));
    if (templates.length)
      await syncApi.pushMealTemplates(templates.map((t) => nutritionRowDto(t.id, t)));
    if (weights.length) await syncApi.pushWeightEntries(weights.map((w) => nutritionRowDto(w.id, w)));
    if (goal) await syncApi.pushNutritionGoal({ dataJson: JSON.stringify(goal), updatedAtMs: goal.updatedAtMs });
  } catch (e) { syncWarn("pushAllNutrition", e); }
}

export async function pullAndMergeNutrition(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  const repo = getNutritionRepo();
  // Seven independent pulls, each already isolated by its own try/catch (a network hiccup on
  // one shouldn't skip the rest) — ok tracks whether every one of them actually completed, so
  // this can report honestly even though it never throws itself.
  let ok = true;

  try {
    const since = getTimestamp(NUTRITION_DAYS_LAST_PULLED_KEY);
    const { days } = await syncApi.pullNutritionDays(since);
    for (const e of days) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeDayFromRemote(e.id).catch((e) => syncWarn("pullAndMergeNutrition", e));
        continue;
      }
      try {
        const day = JSON.parse(e.dataJson) as DiaryDay;
        const existing = await repo.getDay(day.dateIso);
        if (existing && existing.updatedAtMs >= day.updatedAtMs) continue;
        await repo.upsertDayFromRemote(day);
      } catch (e) { syncWarn("pullAndMergeNutrition", e); }
    }
    setTimestamp(NUTRITION_DAYS_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  try {
    const since = getTimestamp(CUSTOM_FOODS_LAST_PULLED_KEY);
    const { foods } = await syncApi.pullCustomFoods(since);
    for (const e of foods) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeCustomFoodFromRemote(e.id).catch((e) => syncWarn("pullAndMergeNutrition", e));
        continue;
      }
      try {
        const food = JSON.parse(e.dataJson) as CustomFood;
        const existing = await repo.getCustomFood(food.food.id);
        if (existing && existing.updatedAtMs >= food.updatedAtMs) continue;
        await repo.upsertCustomFoodFromRemote(food);
      } catch (e) { syncWarn("pullAndMergeNutrition", e); }
    }
    setTimestamp(CUSTOM_FOODS_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  try {
    const since = getTimestamp(RECIPES_LAST_PULLED_KEY);
    const { recipes } = await syncApi.pullRecipes(since);
    for (const e of recipes) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeRecipeFromRemote(e.id).catch((e) => syncWarn("pullAndMergeNutrition", e));
        continue;
      }
      try {
        const recipe = JSON.parse(e.dataJson) as Recipe;
        const existing = await repo.getRecipe(recipe.id);
        if (existing && existing.updatedAtMs >= recipe.updatedAtMs) continue;
        await repo.upsertRecipeFromRemote(recipe);
      } catch (e) { syncWarn("pullAndMergeNutrition", e); }
    }
    setTimestamp(RECIPES_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  try {
    const since = getTimestamp(FAVORITES_LAST_PULLED_KEY);
    const { favorites } = await syncApi.pullFavorites(since);
    const local = await repo.listFavorites();
    for (const e of favorites) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeFavoriteFromRemote(e.id).catch((e) => syncWarn("pullAndMergeNutrition", e));
        continue;
      }
      try {
        const fav = JSON.parse(e.dataJson) as FavoriteFood;
        const existing = local.find((f) => f.food.id === fav.food.id);
        if (existing && existing.updatedAtMs >= fav.updatedAtMs) continue;
        await repo.upsertFavoriteFromRemote(fav);
      } catch (e) { syncWarn("pullAndMergeNutrition", e); }
    }
    setTimestamp(FAVORITES_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  try {
    const since = getTimestamp(MEAL_TEMPLATES_LAST_PULLED_KEY);
    const { templates } = await syncApi.pullMealTemplates(since);
    const local = await repo.listMealTemplates();
    for (const e of templates) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeMealTemplateFromRemote(e.id).catch((e) => syncWarn("pullAndMergeNutrition", e));
        continue;
      }
      try {
        const t = JSON.parse(e.dataJson) as MealTemplate;
        const existing = local.find((x) => x.id === t.id);
        if (existing && existing.updatedAtMs >= t.updatedAtMs) continue;
        await repo.upsertMealTemplateFromRemote(t);
      } catch (e) { syncWarn("pullAndMergeNutrition", e); }
    }
    setTimestamp(MEAL_TEMPLATES_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  try {
    const since = getTimestamp(WEIGHT_ENTRIES_LAST_PULLED_KEY);
    const { entries } = await syncApi.pullWeightEntries(since);
    for (const e of entries) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeWeightEntryFromRemote(e.id).catch((e) => syncWarn("pullAndMergeNutrition", e));
        continue;
      }
      try {
        const entry = JSON.parse(e.dataJson) as WeightEntry;
        const existing = await repo.getWeightEntry(entry.id);
        if (existing && existing.updatedAtMs >= entry.updatedAtMs) continue;
        await repo.upsertWeightEntryFromRemote(entry);
      } catch (e) { syncWarn("pullAndMergeNutrition", e); }
    }
    setTimestamp(WEIGHT_ENTRIES_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  try {
    const { goal } = await syncApi.pullNutritionGoal();
    if (goal?.dataJson) {
      const remoteGoal = JSON.parse(goal.dataJson) as NutritionGoal;
      const localGoal = await repo.getGoal();
      if (!localGoal || remoteGoal.updatedAtMs > localGoal.updatedAtMs) {
        await repo.upsertGoalFromRemote(remoteGoal);
      }
    }
  } catch (e) {
    syncWarn("pullAndMergeNutrition", e);
    ok = false;
  }

  return ok;
}

// ── Habits ───────────────────────────────────────────────────────────────────
// Personal habits + per-day check-offs. Client-owned, LWW by updatedAtMs, tombstoned.
// Entry ids are derived from (habit, day) so two devices converge on one row.

type HabitRow = { createdAtMs: number; updatedAtMs: number; deletedAtMs?: number };

function habitRowDto(id: string, row: HabitRow) {
  return {
    id,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    dataJson: row.deletedAtMs ? null : JSON.stringify(row),
    deletedAtMs: row.deletedAtMs,
  };
}

export function pushHabit(habit: Habit): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = habitRowDto(habit.id, habit);
  syncApi.pushHabits([dto]).catch(() => enqueue({ type: "habit", dto }));
}

export function pushHabitEntry(entry: HabitEntry): void {
  if (!apiClient.isAuthenticated()) return;
  const dto = habitRowDto(entry.id, entry);
  syncApi.pushHabitEntries([dto]).catch(() => enqueue({ type: "habitEntry", dto }));
}

/** Push a tombstone for a habit and every check-off it just took down with it. */
export function pushHabitDeletion(habit: Habit, entries: HabitEntry[]): void {
  if (!apiClient.isAuthenticated()) return;
  const now = Date.now();
  const habitDto = habitRowDto(habit.id, { ...habit, updatedAtMs: now, deletedAtMs: now });
  syncApi.pushHabits([habitDto]).catch(() => enqueue({ type: "habit", dto: habitDto }));
  if (entries.length) {
    const dtos = entries.map((e) => habitRowDto(e.id, { ...e, updatedAtMs: now, deletedAtMs: now }));
    syncApi
      .pushHabitEntries(dtos)
      .catch(() => dtos.forEach((dto) => enqueue({ type: "habitEntry", dto })));
  }
}

/** Push every local habit + entry — called once when sync newly becomes available. */
export async function pushAllHabits(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const repo = getHabitRepo();
    const [habits, entries] = await Promise.all([
      repo.listHabitsForPush(),
      repo.listEntriesForPush(),
    ]);
    if (habits.length) await syncApi.pushHabits(habits.map((h) => habitRowDto(h.id, h)));
    if (entries.length)
      await syncApi.pushHabitEntries(entries.map((e) => habitRowDto(e.id, e)));
  } catch (e) { syncWarn("pushAllHabits", e); }
}

export async function pullAndMergeHabits(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  const repo = getHabitRepo();
  let ok = true;

  try {
    const since = getTimestamp(HABITS_LAST_PULLED_KEY);
    const { habits } = await syncApi.pullHabits(since);
    for (const e of habits) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeHabitFromRemote(e.id).catch((e) => syncWarn("pullAndMergeHabits", e));
        continue;
      }
      try {
        const habit = JSON.parse(e.dataJson) as Habit;
        const existing = await repo.getHabit(habit.id);
        if (existing && existing.updatedAtMs >= habit.updatedAtMs) continue;
        await repo.upsertHabitFromRemote(habit);
      } catch (e) { syncWarn("pullAndMergeHabits", e); }
    }
    setTimestamp(HABITS_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeHabits", e);
    ok = false;
  }

  try {
    const since = getTimestamp(HABIT_ENTRIES_LAST_PULLED_KEY);
    const { entries } = await syncApi.pullHabitEntries(since);
    for (const e of entries) {
      if (e.deletedAtMs || !e.dataJson) {
        await repo.removeEntryFromRemote(e.id).catch((e) => syncWarn("pullAndMergeHabits", e));
        continue;
      }
      try {
        const entry = JSON.parse(e.dataJson) as HabitEntry;
        const existing = await repo.getEntry(entry.habitId, entry.dateIso);
        if (existing && existing.updatedAtMs >= entry.updatedAtMs) continue;
        await repo.upsertEntryFromRemote(entry);
      } catch (e) { syncWarn("pullAndMergeHabits", e); }
    }
    setTimestamp(HABIT_ENTRIES_LAST_PULLED_KEY, Date.now());
  } catch (e) {
    syncWarn("pullAndMergeHabits", e);
    ok = false;
  }

  return ok;
}

/** Pull the habits a coach has assigned into the local read-only mirror. */
export async function pullAndMergeAssignedHabits(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const since = getTimestamp(COACH_HABITS_LAST_PULLED_KEY);
    const remote = await coachHabitApi.pullAssigned(since);
    if (remote.length === 0) {
      setTimestamp(COACH_HABITS_LAST_PULLED_KEY, Date.now());
      return true;
    }
    const repo = getAssignedHabitRepo();
    for (const entry of remote) {
      if (entry.deletedAtMs || !entry.dataJson) {
        await repo.removeFromRemote(entry.habitId).catch((e) => syncWarn("pullAndMergeAssignedHabits", e));
        continue;
      }
      try {
        const habit = JSON.parse(entry.dataJson) as CoachHabit;
        const existing = await repo.getAssignedHabit(habit.id);
        if (existing && existing.updatedAtMs >= habit.updatedAtMs) continue;
        await repo.upsertFromRemote(habit);
      } catch (e) { syncWarn("pullAndMergeAssignedHabits", e); }
    }
    setTimestamp(COACH_HABITS_LAST_PULLED_KEY, Date.now());
    return true;
  } catch (e) {
    syncWarn("pullAndMergeAssignedHabits", e);
    return false;
  }
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

/**
 * Builds the current local profile as a RemoteProfile DTO, ready to push. Always build the
 * DTO through this — the server stores it as one replace-on-write blob (no per-field merge),
 * so a hand-built literal that leaves out a field (e.g. activeSplitId) silently wipes that
 * field out for the next puller, not just leaves it unchanged.
 */
export async function buildRemoteProfile(): Promise<RemoteProfile> {
  const { get } = await import("svelte/store");
  const [{ profile }, { getNavConfigJson }, { getHomeConfigJson }] = await Promise.all([
    import("$lib/stores/profile.store"),
    import("$lib/stores/navConfig.store"),
    import("$lib/stores/homeConfig.store"),
  ]);
  const p = get(profile);
  const activeSplitId = await getSplitRepo().getActiveSplitId().catch(() => null);
  // Only this profile's splits: rotation keys aren't per profile on the phone.
  const splitIds = (
    await getSplitRepo().getListSplits({ includeArchived: true, limit: 1000 }).catch(() => [])
  ).map((s) => s.id);
  const { getRotations } = await import("$lib/usecases/Splits/splitRotation");
  const rotations = getRotations(splitIds);
  return {
    displayName: p.name,
    bio: p.bio,
    avatarDataUrl: p.avatarDataUrl ?? null,
    progressPhotoDataUrl: p.progressPhotoDataUrl ?? null,
    height: p.height,
    heightUnit: p.heightUnit,
    weight: p.weight,
    weightUnit: p.weightUnit,
    blocksCollapsedByDefault: p.blocksCollapsedByDefault,
    restDefaultsJson: JSON.stringify(p.restDefaults),
    navConfigJson: getNavConfigJson(),
    homeConfigJson: getHomeConfigJson(),
    activeSplitId,
    splitRotationJson: Object.keys(rotations).length ? JSON.stringify(rotations) : null,
    updatedAtMs: Date.now(),
  };
}

/**
 * Push the current full profile (built via buildRemoteProfile(), so it's never a partial
 * blob). Called whenever a local edit happens to something that rides along on the profile
 * sync blob but isn't part of profile.store.ts itself — nav layout (navConfig.store.ts) and
 * home widget layout (homeConfig.store.ts) both call this after an edit, the same way
 * profile.store.ts's own save() pushes after its edits.
 */
export async function pushNavConfig(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const remote = await buildRemoteProfile();
    setProfileUpdatedAtMs(remote.updatedAtMs);
    syncApi.pushProfile(remote).catch(() => enqueue({ type: "profile", dto: remote }));
  } catch (e) { syncWarn("pushNavConfig", e); }
}

/**
 * Push whatever profile data (name, bio, avatar, height/weight, rest-timer defaults, nav
 * layout, active split) currently exists locally. Needed alongside every other pushAllXxx()
 * — without it, profile fields entered before the user ever signed in (the common case:
 * onboarding runs fully offline-first, see project_auth_app_first_redo memory) never reach
 * the server until the user happens to edit their profile again post-login.
 * profile.store.ts's save() only pushes on an active edit — it can't push what was set
 * before an authenticated session existed to push it *to*.
 *
 * Deliberately NOT part of pushAllLocalData() below, unlike every other pushAllXxx() —
 * call it only *after* syncAll() has pulled first (see login()/register() in
 * authStore.svelte.ts). Every other data type here is a list, so pushAllXxx() has a natural
 * "nothing local yet" guard (`if (all.length === 0) return`) that makes push-before-pull
 * safe. Profile is a single always-present object with no such guard — on every fresh
 * install its fields start out blank, and since this always builds a fresh (newer)
 * updatedAtMs, a naive push-before-pull would silently overwrite a real, already-synced
 * profile with blanks on every single re-login. Pulling first means a real server profile
 * lands locally before this ever runs, so it just pushes that back (a harmless no-op),
 * while a genuinely pre-login, never-yet-synced local profile (nothing to pull) still
 * reaches the server correctly.
 */
export async function pushCurrentProfile(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const remote = await buildRemoteProfile();
    setProfileUpdatedAtMs(remote.updatedAtMs);
    await syncApi.pushProfile(remote);
  } catch (e) { syncWarn("pushCurrentProfile", e); }
}

/**
 * Pushes every existing local record to the server, regardless of whether it's ever
 * been pushed before. Call this once whenever sync newly becomes available on a device
 * (login, register) — otherwise only records created/edited *after* that moment ever
 * reach the server, silently leaving pre-existing local history (the common case: a
 * user who's been logging offline and only later signs in) without a cloud copy at all.
 *
 * Profile is NOT included here — see pushCurrentProfile()'s comment for why it must run
 * after syncAll() pulls, not alongside these.
 */
export async function pushAllLocalData(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  await Promise.all([
    pushAllSessions(),
    pushAllSplits(),
    pushAllExercises(),
    pushAllAuthoredPrograms(),
    pushAllCheckinSubmissions(),
    pushAllAuthoredCheckinSchedules(),
    pushPendingMessages(),
    pushAllNutrition(),
    pushAllHabits(),
  ]);
}

/** Sync now. One sync at a time: login, the 5-minute timer, the app coming back to the
 * foreground and the Settings button all call this, and two overlapping runs used to flush
 * the outbox twice and pull the same data twice. A call during a run joins it and asks for
 * one more pass afterwards; the result is the last pass's. */
export const syncAll: () => Promise<boolean> = singleFlight(() => syncOnce());

/** Runs every pull in parallel and only reports (and timestamps) success when all of them
 * actually completed — a Free-tier account whose pulls all 403 must not see a clean "synced"
 * state (see docs/bugs/social-smoke-test-findings.md #3). Returns false if any pull failed. */
async function syncOnce(): Promise<boolean> {
  const started = Date.now();
  log.debug("sync", "Sync started");
  // Flush any writes queued while offline before pulling, so the server has the
  // latest local state before we merge its response back.
  await flushOutbox();
  await pushPendingMessages();
  const pulls: [string, Promise<boolean>][] = [
    ["sessions", pullAndMergeSessions()],
    ["splits", pullAndMergeSplits()],
    ["exercises", pullAndMergeExercises()],
    ["coach programs", pullAndMergeCoachPrograms()],
    ["coach nutrition plan", pullAndMergeCoachNutritionPlan()],
    ["check-in schedules", pullAndMergeCheckinSchedules()],
    ["check-ins", pullAndMergeCheckinSubmissions()],
    ["messages", pullAndMergeMessages()],
    ["nutrition", pullAndMergeNutrition()],
    ["habits", pullAndMergeHabits()],
    ["assigned habits", pullAndMergeAssignedHabits()],
    ["profile", pullAndApplyProfile()],
  ];
  const results = await Promise.all(pulls.map(([, p]) => p));
  const ok = results.every(Boolean);
  const ms = Date.now() - started;
  if (ok) {
    const now = Date.now();
    setTimestamp(LAST_SYNCED_AT_KEY, now);
    lastSyncedAt.set(now);
    log.debug("sync", "Sync finished", { ms, queued: outboxSize() });
  } else {
    const failed = pulls.filter((_, i) => !results[i]).map(([name]) => name);
    log.warn("sync", "Sync incomplete", { failed, ms, queued: outboxSize() });
  }
  return ok;
}

export async function pullAndApplyProfile(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const { profile: remote } = await syncApi.pullProfile();
    if (!remote) return true;

    // Split rotation is merged per split (newest wins), whatever the profile's own age: a
    // workout on another device moves the next day here even if this profile was edited
    // more recently.
    if (remote.splitRotationJson) {
      try {
        const { applyRemoteRotations } = await import("$lib/usecases/Splits/splitRotation");
        applyRemoteRotations(JSON.parse(remote.splitRotationJson));
      } catch (e) { syncWarn("pullAndApplyProfile", e); }
    }

    const localUpdatedAtMs = getProfileUpdatedAtMs();
    if (remote.updatedAtMs <= localUpdatedAtMs) return true;

    if (isNativePlatform()) {
      const { updateLocalAccount } = await import("$lib/data/localAccountRepo");
      const { getActiveOwnerId } = await import("$lib/data/activeOwner");
      const ownerId = getActiveOwnerId();
      if (ownerId) {
        await updateLocalAccount(ownerId, {
          displayName: remote.displayName,
          bio: remote.bio,
          avatarDataUrl: remote.avatarDataUrl ?? null,
          progressPhotoDataUrl: remote.progressPhotoDataUrl ?? null,
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
      } catch (e) { syncWarn("pullAndApplyProfile", e); }
    }

    // Home widget layout was previously a single, un-namespaced localStorage key — not
    // synced, and not even per-profile-scoped locally. Every fresh install/re-login lost it.
    if (remote.homeConfigJson) {
      try {
        const { homeConfig } = await import("$lib/stores/homeConfig.store");
        homeConfig.applyRemote(JSON.parse(remote.homeConfigJson));
      } catch (e) { syncWarn("pullAndApplyProfile", e); }
    }

    // Which split is "active" was previously a local-only meta-table entry with no sync
    // path at all — every fresh install/re-login lost it even though the split data itself
    // (days/blocks) synced fine, forcing the user to re-pick it by hand every time.
    if (remote.activeSplitId !== undefined) {
      await getSplitRepo().setActiveSplitId(remote.activeSplitId).catch((e) => syncWarn("pullAndApplyProfile", e));
    }

    let restDefaults: Record<string, number | undefined> = {};
    try { restDefaults = JSON.parse(remote.restDefaultsJson); } catch (e) { syncWarn("pullAndApplyProfile", e); }

    // applyRemote(), not save() — save() always re-pushes with a fresh timestamp, which
    // would make every routine pull look like a brand-new edit and could race with (and
    // win against) a real one made around the same time. A pull only ever updates local
    // state; see applyRemote()'s own comment (profile.store.ts) for the full story.
    const { profile } = await import("$lib/stores/profile.store");
    profile.applyRemote({
      name: remote.displayName,
      bio: remote.bio,
      avatarDataUrl: remote.avatarDataUrl ?? undefined,
      progressPhotoDataUrl: remote.progressPhotoDataUrl ?? undefined,
      height: remote.height,
      heightUnit: remote.heightUnit,
      weight: remote.weight,
      weightUnit: remote.weightUnit,
      blocksCollapsedByDefault: remote.blocksCollapsedByDefault,
      restDefaults,
    });

    setProfileUpdatedAtMs(remote.updatedAtMs);
    return true;
  } catch (e) {
    syncWarn("pullAndApplyProfile", e);
    return false;
  }
}
