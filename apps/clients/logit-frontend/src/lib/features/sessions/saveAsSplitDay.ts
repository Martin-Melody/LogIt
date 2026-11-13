import type { WorkoutSession } from "@logit/core/domain/workout";
import { blockDisplayName } from "@logit/core/domain/workout";
import type { SplitDay, WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { plannedBlockName } from "@logit/core/domain/WorkoutSplit";
import { splitDayTitle } from "@logit/core/domain/splitSchedule";

/** "Day 5 — Lower 2" for a day of the split. */
export function splitDayTitleFor(split: WorkoutSplit, dayId: string): string {
  const day = split.days.find((d) => d.id === dayId);
  return day ? splitDayTitle(split, day) : "Day";
}

/** "Leg Press back in, Hamstring Stretch and Bike added": what replacing the day would change. */
export function splitDayChanges(session: WorkoutSession, day: SplitDay): string {
  const now = day.blocks.map((b) => plannedBlockName(b).toLowerCase());
  const done = session.blocks.map(blockDisplayName);
  const added = done.filter((n) => !now.includes(n.toLowerCase()));
  const doneLower = done.map((n) => n.toLowerCase());
  const gone = day.blocks.map(plannedBlockName).filter((n) => !doneLower.includes(n.toLowerCase()));
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
  const parts = [
    ...(added.length ? [`${list(added)} added`] : []),
    ...(gone.length ? [`${list(gone)} taken out`] : []),
  ];
  return parts.length ? parts.join(", ") : "no change in exercises";
}
