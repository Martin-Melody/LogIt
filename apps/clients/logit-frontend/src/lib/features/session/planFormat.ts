import type { ProgressionChange, SuggestedSet } from "@logit/core/domain/progression";
import type { SetTarget } from "@logit/core/domain/workout";
import type { WeightUnit } from "@logit/core/domain/units";
import { formatLoad } from "@logit/core/domain/units";

export function formatTargetReps(t: Pick<SetTarget, "reps" | "repsMax">): string {
  return t.repsMax !== undefined && t.repsMax !== t.reps ? `${t.reps}–${t.repsMax}` : String(t.reps);
}

function suggestedReps(r: SuggestedSet["reps"]): string {
  return Array.isArray(r) ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`) : String(r);
}

/**
 * "62.5 kg × 7 / 6 / 6", "BW × 8 / 7 / 5" — or set by set ("5 × BW+2.5, 7 × BW")
 * when the weights differ.
 */
export function formatPrescription(sets: SuggestedSet[], unit: WeightUnit, bodyweight = false): string {
  if (sets.length === 0) return "";
  const first = sets[0]!;
  if (sets.every((s) => s.weight === first.weight)) {
    const reps = sets.map((s) => suggestedReps(s.reps));
    // No weight yet (first time on a loaded exercise): just sets and reps.
    if (first.weight === 0 && !bodyweight) {
      return reps.every((r) => r === reps[0]) ? `${sets.length} sets × ${reps[0]} reps` : `${reps.join(" / ")} reps`;
    }
    return `${formatLoad(first.weight, unit, bodyweight)} × ${reps.join(" / ")}`;
  }
  return sets.map((s) => `${suggestedReps(s.reps)} × ${formatLoad(s.weight, unit, bodyweight, { withUnit: false })}`).join(", ");
}

/** Tailwind classes for a change tag; the colours differ in lightness, not only hue. */
export function changeTagClass(kind: ProgressionChange["kind"]): string {
  switch (kind) {
    case "increase":
      return "bg-foreground text-background";
    case "deload":
      return "border border-warning/60 bg-warning/10 text-warning";
    case "repeat":
      return "border border-border bg-muted text-foreground";
    case "first":
      return "border border-border text-muted-foreground";
    default:
      return "bg-info/10 text-info dark:bg-info/15";
  }
}

/**
 * One cell per rep up to the rep count where the weight goes up (`goalReps`):
 * - `hit`: a rep that counts towards today's aim,
 * - `bonus`: a rep beyond today's aim (the reward colour),
 * - `target`: a rep of the aim not done yet (dashed),
 * - `rest`: reps still to go before the weight goes up.
 * A set with no aim (`target` 0) counts every rep as `hit`.
 */
export type MeterCell = "hit" | "bonus" | "target" | "rest";

export type MeterRow = { right: string; spoken: string; cells: MeterCell[]; converted: boolean };

/**
 * `logged`: the reps actually typed in, when the set was done at a different
 * weight from the plan. `done` is then those reps worked out at the planned
 * weight (see repsAtLoad), so 5 at +2.5 kg reads as ≈6 of 7, not a 5.
 */
export function meterRow(done: number, target: number, goalReps: number, logged?: number): MeterRow {
  const aim = target > 0 ? target : done;
  const cells: MeterCell[] = Array.from({ length: goalReps }, (_, c) =>
    c < Math.min(done, aim) ? "hit" : c < done ? "bonus" : c < aim ? "target" : "rest",
  );

  let right: string;
  let spoken: string;
  if (logged !== undefined && target > 0) {
    // No ✓ here: the weight only goes up from reps at the weight actually used.
    right = done < target ? `≈${done}/${target}` : done > target ? `≈${done} +${done - target}` : `≈${done}`;
    spoken = `${logged} reps at a different weight, about ${done} at the planned weight; ${target} aimed for`;
    return { right, spoken, cells, converted: true };
  }
  if (done === 0) {
    right = target > 0 ? `aim ${target}` : "";
    spoken = target > 0 ? `aiming for ${target} reps; the weight goes up at ${goalReps}` : "not done yet";
  } else if (done >= goalReps) {
    right = `${done} ✓`;
    spoken = `${done} reps: reached ${goalReps}, the weight goes up`;
  } else if (target > 0 && done < target) {
    right = `${done}/${target}`;
    spoken = `${done} of the ${target} reps aimed for`;
  } else if (target > 0 && done > target) {
    right = `${done} +${done - target}`;
    spoken = `${done} reps, ${done - target} more than the ${target} aimed for`;
  } else {
    right = target > 0 ? `${done}/${target}` : `${done}`;
    spoken = target > 0 ? `${done} reps, the ${target} aimed for` : `${done} reps`;
  }
  return { right, spoken, cells, converted: false };
}
