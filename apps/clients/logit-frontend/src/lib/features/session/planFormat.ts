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
      return "border border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-300";
    case "repeat":
      return "border border-border bg-muted text-foreground";
    case "first":
      return "border border-border text-muted-foreground";
    default:
      return "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
  }
}
