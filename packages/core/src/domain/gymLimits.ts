// When a client's plan outgrows their gym (Phase 6.15, canvas EQ1): a machine's stack, the
// heaviest dumbbells. Found from their copy's plan and the gym they train at, so the coach is
// told ahead ("Leg extension at Flyefit goes to 100 kg; her plan reaches 105 kg in week 6").
import { planExercise, type PlanContext } from "./programPlan";
import { chosenMachine, dumbbellWeightsKg, effectiveMachine, type Place } from "./place";
import { machineWeightsKg } from "./machine";
import type { CoachProgram } from "./CoachProgram";

export type GymLimit = {
  blockId: string;
  exerciseName: string;
  /** "Leg extension" (the machine) or "dumbbells". */
  what: string;
  placeName: string;
  topKg: number;
  /** The first week the plan asks for more, and how much. */
  week: number;
  plannedKg: number;
  /** What the coach has picked for it already, if anything. */
  decided: boolean;
};

/** Their usual gym: the place with the most usual days, else the first gym. */
export function usualGym(places: Place[]): Place | null {
  const live = places.filter((p) => !p.archivedAtMs);
  return [...live].sort((a, b) => (b.usualDays?.length ?? 0) - (a.usualDays?.length ?? 0))[0] ?? null;
}

export function gymLimits(program: CoachProgram, place: Place | null, ctx: PlanContext, fromWeek = 1): GymLimit[] {
  if (!place) return [];
  const out: GymLimit[] = [];
  const w = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber)[0];
  const seen = new Set<string>();
  for (const d of w?.days ?? []) {
    for (const b of d.blocks) {
      if (b.type !== "strength" || seen.has(b.id) || !b.exerciseId) continue;
      seen.add(b.id);
      const m = chosenMachine(place, b.exerciseId);
      const rungs = m ? (machineWeightsKg(effectiveMachine(m)) ?? []) : /dumbbell/i.test(b.exerciseName) ? dumbbellWeightsKg(place.dumbbells) : [];
      const top = rungs.length ? rungs[rungs.length - 1]! : null;
      // A machine they can load past with their pin isn't a limit.
      if (top == null || (m?.extraLoad ?? []).length) continue;
      const cells = planExercise(program, b.id, ctx);
      const i = cells.findIndex((c, k) => k + 1 >= fromWeek && c?.weight != null && c.weight > top + 0.01);
      if (i < 0) continue;
      out.push({ blockId: b.id, exerciseName: b.exerciseName, what: m ? m.name : "dumbbells", placeName: place.name, topKg: top, week: i + 1, plannedKg: cells[i]!.weight!, decided: !!b.atTop });
    }
  }
  return out;
}
