import { syncApi } from "@logit/core/api/syncApi";
import type { RemoteSession, RemoteSplit, RemoteExercise, RemoteProfile } from "@logit/core/api/syncApi";
import { coachProgramApi, type UpsertCoachProgramInput } from "@logit/core/api/coachProgramApi";
import { checkinApi, type UpsertCheckinScheduleInput } from "@logit/core/api/checkinApi";
import { messagesApi, type SendMessageInput } from "@logit/core/api/messagesApi";
import type {
  RemoteCheckinSubmission,
  RemoteCustomFood,
  RemoteNutritionDay,
  RemoteNutritionGoal,
  RemoteRecipe,
  RemoteWeightEntry,
} from "@logit/core/api/syncApi";

const KEY = "logit:sync:outbox";

type OutboxEntry =
  | { type: "session"; dto: RemoteSession }
  | { type: "split"; dto: RemoteSplit }
  | { type: "exercise"; dto: RemoteExercise }
  | { type: "profile"; dto: RemoteProfile }
  | { type: "coachProgram"; dto: UpsertCoachProgramInput }
  | { type: "checkinSchedule"; dto: UpsertCheckinScheduleInput }
  | { type: "checkinSubmission"; dto: RemoteCheckinSubmission }
  | { type: "coachMessage"; dto: SendMessageInput }
  | { type: "nutritionDay"; dto: RemoteNutritionDay }
  | { type: "customFood"; dto: RemoteCustomFood }
  | { type: "recipe"; dto: RemoteRecipe }
  | { type: "weightEntry"; dto: RemoteWeightEntry }
  | { type: "nutritionGoal"; dto: RemoteNutritionGoal };

function load(): OutboxEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function save(entries: OutboxEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {}
}

export function enqueue(entry: OutboxEntry): void {
  const entries = load();
  entries.push(entry);
  save(entries);
}

export async function flush(): Promise<void> {
  const entries = load();
  if (entries.length === 0) return;

  // Clear atomically before attempting — new writes during flush will be separate entries
  save([]);

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
  const weightEntries = entries
    .filter((e): e is Extract<OutboxEntry, { type: "weightEntry" }> => e.type === "weightEntry")
    .map((e) => e.dto);
  const nutritionGoal = entries
    .filter((e): e is Extract<OutboxEntry, { type: "nutritionGoal" }> => e.type === "nutritionGoal")
    .map((e) => e.dto)
    .at(-1); // singleton — last write wins

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
  if (weightEntries.length) {
    try { await syncApi.pushWeightEntries(weightEntries); }
    catch { weightEntries.forEach((dto) => failed.push({ type: "weightEntry", dto })); }
  }
  if (nutritionGoal) {
    try { await syncApi.pushNutritionGoal(nutritionGoal); }
    catch { failed.push({ type: "nutritionGoal", dto: nutritionGoal }); }
  }

  if (failed.length > 0) {
    // Prepend failed entries so they retry first; preserve any new entries queued during flush
    const newer = load();
    save([...failed, ...newer]);
  }
}
