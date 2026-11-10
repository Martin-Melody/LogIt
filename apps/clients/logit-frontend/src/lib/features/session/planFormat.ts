import type { ProgressionChange, SuggestedSet } from "@logit/core/domain/progression";
import type { SetEntry, SetTarget } from "@logit/core/domain/workout";
import type { WeightUnit } from "@logit/core/domain/units";
import { formatWeight } from "@logit/core/domain/units";

export function formatTargetReps(t: Pick<SetTarget, "reps" | "repsMax">): string {
  return t.repsMax !== undefined && t.repsMax !== t.reps ? `${t.reps}–${t.repsMax}` : String(t.reps);
}

function suggestedReps(r: SuggestedSet["reps"]): string {
  return Array.isArray(r) ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`) : String(r);
}

/** "62.5 kg × 7 / 6 / 6" — or per-set "7×62.5, 6×60" when the weights differ. */
export function formatPrescription(sets: SuggestedSet[], unit: WeightUnit): string {
  if (sets.length === 0) return "";
  const first = sets[0]!;
  if (sets.every((s) => s.weight === first.weight)) {
    const reps = sets.map((s) => suggestedReps(s.reps));
    // No weight yet (first time, or bodyweight): just sets and reps.
    if (first.weight === 0) {
      return reps.every((r) => r === reps[0]) ? `${sets.length} sets × ${reps[0]} reps` : `${reps.join(" / ")} reps`;
    }
    return `${formatWeight(first.weight, unit)} × ${reps.join(" / ")}`;
  }
  return sets.map((s) => `${suggestedReps(s.reps)} × ${formatWeight(s.weight, unit, { withUnit: false })}`).join(", ");
}

/** What a set row shows in its "Today" column, and whether it's still only planned. */
export function todayCell(
  set: Pick<SetEntry, "reps" | "weight" | "completed" | "target">,
  unit: WeightUnit,
): { text: string; planned: boolean; empty: boolean } {
  const w = (kg: number) => formatWeight(kg, unit, { withUnit: false });
  const logged = !!set.completed || set.reps > 0;
  if (logged) return { text: `${set.reps} × ${w(set.weight)}`, planned: false, empty: false };
  // The weight may have been changed before the set was done; reps come from the plan.
  if (set.target) {
    const kg = set.weight || set.target.weight;
    return { text: kg ? `${formatTargetReps(set.target)} × ${w(kg)}` : `${formatTargetReps(set.target)} reps`, planned: true, empty: false };
  }
  return { text: set.weight ? `– × ${w(set.weight)}` : "Enter", planned: false, empty: true };
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
