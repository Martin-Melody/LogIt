// A workout or record shared into a chat (friends overhaul, design canvas M2). The same payload
// formats as a post's WorkoutSession / PersonalRecord attachment, plus the day's name and when,
// so "Lower A · last Tuesday" can be shown. A snapshot: editing the workout later doesn't change it.
import { getExercises, type WorkoutSession } from "./workout";

export type CardType = "WorkoutSession" | "PersonalRecord";
export type WorkoutCard = { name?: string | null; atMs?: number; duration?: number; exercises?: { name: string; sets: number }[] };
export type RecordCard = { exerciseName: string; weight?: number; unit?: string; reps?: number; atMs?: number };
export type Card = { type: "WorkoutSession"; data: WorkoutCard } | { type: "PersonalRecord"; data: RecordCard };

export function workoutCard(s: WorkoutSession): string {
  return JSON.stringify({
    name: s.name ?? s.source?.dayName ?? null,
    atMs: s.endedAtMs ?? s.startedAtMs,
    duration: s.endedAtMs ? s.endedAtMs - s.startedAtMs : 0,
    exercises: getExercises(s).map((ex) => ({ name: ex.exerciseName, sets: ex.sets.length })),
  } satisfies WorkoutCard);
}

export function recordCard(r: { exerciseName: string; weight: number; reps: number; atMs: number }): string {
  return JSON.stringify({ exerciseName: r.exerciseName, weight: r.weight, unit: "kg", reps: r.reps, atMs: r.atMs } satisfies RecordCard);
}

/** Null for anything unknown or broken (shown as nothing rather than an error). */
export function readCard(type: string | null | undefined, json: string | null | undefined): Card | null {
  if (!type || !json) return null;
  try {
    const data = JSON.parse(json);
    if (type === "WorkoutSession" && data && typeof data === "object") return { type, data };
    if (type === "PersonalRecord" && typeof data?.exerciseName === "string") return { type, data };
  } catch {
    /* fall through */
  }
  return null;
}

/** "Squat 107.5 kg × 3" / "Push A · 52 min · 5 exercises". */
export function cardTitle(card: Card): string {
  if (card.type === "PersonalRecord") {
    const { exerciseName, weight, unit, reps } = card.data;
    return [exerciseName, weight ? `${weight} ${unit ?? "kg"}${reps ? ` × ${reps}` : ""}` : reps ? `${reps} reps` : ""].filter(Boolean).join(" ");
  }
  const { name, duration, exercises } = card.data;
  const n = exercises?.length ?? 0;
  return [name || "Workout", duration ? `${Math.round(duration / 60_000)} min` : "", n ? `${n} exercise${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
}
