import type { SetEntry } from "@logit/core/domain/workout";

/** The weight to log on a set ticked with none entered and none planned (a coach's program can
 * leave the load blank): the set before it, added or assisted weight included. Undefined when
 * there's nothing to carry or the set has its own weight or plan. */
export function carriedWeight(sets: SetEntry[], set: SetEntry): number | undefined {
  if (set.weight !== 0 || set.target?.weight) return undefined;
  return sets
    .filter((x) => x.orderIndex < set.orderIndex && x.weight !== 0)
    .sort((a, b) => b.orderIndex - a.orderIndex)[0]?.weight;
}
