import { FEATURES } from "./features";
import { planRank, type Feature, type Plan } from "./types";

// "What each plan can do", worked out from the feature list. The pricing page, the phone's
// Plans screen, the web Upgrade page and the docs all show this, so they can't disagree.

/** true = included, false = not, a string = included with a condition. */
export type PlanCell = boolean | string;
export type PlanRow = { feature: Feature; label: string; docs: string; cells: Record<Plan, PlanCell> };

export function cellFor(f: Feature, plan: Plan): PlanCell {
  if (planRank(plan) < planRank(f.plan)) return f.freeWhenCoached && plan === "Free" ? "With a Studio coach" : false;
  // Free has no web dashboard, so a feature that's on both is phone-only on Free.
  if (plan === "Free" && f.web?.length && f.phone?.length) return "On the phone";
  if (plan === "Free" && f.web?.length && !f.phone?.length) return false;
  return true;
}

export function planTable(): PlanRow[] {
  return FEATURES.filter((f) => f.table).map((f) => ({
    feature: f,
    label: f.table!,
    docs: f.docs,
    cells: { Free: cellFor(f, "Free"), Pro: cellFor(f, "Pro"), Studio: cellFor(f, "Studio") },
  }));
}

/** Short lists for plan cards: what a plan adds over the one below it. */
export function planAdds(plan: Exclude<Plan, "Free">): string[] {
  const below: Plan = plan === "Pro" ? "Free" : "Pro";
  return planTable()
    // A row Free has "on the phone" is not new in Pro: the web dashboard row already says so.
    .filter((r) => r.cells[plan] !== false && r.cells[below] === false)
    .map((r) => r.label);
}
