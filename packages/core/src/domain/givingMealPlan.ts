// Giving a meal plan to a client (canvas MP5, FX1): their own copy from a date, checked against
// their start-up answers and their resting burn; replacing the plan they had, from today or from
// the day the wrong one started.

import { copyData } from "./copyData";
import { createId } from "./ids";
import { nowMs } from "./time";
import { endPlan, foodBreaks, allMeals, planFromIso, type CoachNutritionPlan, type PlannedFood } from "./CoachNutritionPlan";
import type { DietTag, NutritionGoal } from "./nutrition";
import type { AskedQuestion, CheckinAnswer } from "./Checkin";
import { ageFromBirthDate, bmrMifflinStJeor } from "../nutrition/targets";

/** A client's copy of a meal plan from your library, starting on `fromIso`. */
export function copyPlanForClient(plan: CoachNutritionPlan, fromIso: string): CoachNutritionPlan {
  const now = nowMs();
  const { untilIso: _u, ...rest } = copyData(plan);
  return { ...rest, id: createId("cnplan"), sourcePlanId: plan.id, libraryUpdatedAtMs: plan.updatedAtMs, fromIso, archived: false, createdAtMs: now, updatedAtMs: now };
}

/** The start-up form's "Foods you don't eat" (canvas J3), as the plan's tags. */
const AVOID: Record<string, DietTag> = { vegetarian: "vegetarian", vegan: "vegan", "dairy-free": "dairy-free", "gluten-free": "gluten-free", "nut allergy": "nut-free", "nut-free": "nut-free" };
export function foodsTheyDontEat(asked: AskedQuestion[] | undefined, answers: CheckinAnswer[]): DietTag[] {
  const q = asked?.find((x) => /foods? you don'?t eat/i.test(x.prompt));
  const a = q ? answers.find((x) => x.questionId === q.id) : undefined;
  const picked = [...(a?.choices ?? []), ...(a?.text ? [a.text] : [])];
  return [...new Set(picked.map((p) => AVOID[p.trim().toLowerCase()]).filter((t): t is DietTag => !!t))];
}

export type Clash = { food: PlannedFood; tag: DietTag; swap: PlannedFood | null };

/** Foods in the plan they said they don't eat (canvas MP5), and the swap that fits, if any.
 * Plain foods only clash when you marked them; recipes go by their tags. */
export function planClashes(plan: CoachNutritionPlan, avoid: DietTag[]): Clash[] {
  const out: Clash[] = [];
  const seen = new Set<string>();
  for (const m of allMeals(plan)) {
    for (const f of m.foods) {
      for (const tag of foodBreaks(f, avoid)) {
        const key = `${f.name}:${tag}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ food: f, tag, swap: f.swaps?.find((s) => !foodBreaks(s, [tag]).length) ?? null });
      }
    }
  }
  return out;
}

/** Their resting burn (Mifflin–St Jeor), when their own goal has what it needs. */
export function restingBurn(goal: NutritionGoal | null, weightKg: number | null, now = new Date()): number | null {
  if (!goal?.birthDateIso || !goal.heightCm || !weightKg) return null;
  return Math.round(bmrMifflinStJeor({ sex: goal.sex, weightKg, heightCm: goal.heightCm, ageYears: ageFromBirthDate(goal.birthDateIso, now) }));
}

/** When the new plan starts (canvas FX1): from today, tomorrow, or the day the plan they had
 * started ("it was the wrong plan", so past days are measured against the new one). */
export type ReplaceFrom = "today" | "tomorrow" | "wrong";

export function replacePlan(current: CoachNutritionPlan | null, next: CoachNutritionPlan, from: ReplaceFrom, todayIso: string): { ended: CoachNutritionPlan | null; plan: CoachNutritionPlan } {
  const tomorrow = new Date(`${todayIso}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const fromIso = from === "wrong" && current ? planFromIso(current) : from === "today" ? todayIso : t;
  return { ended: current ? endPlan(current, fromIso) : null, plan: { ...next, fromIso } };
}

/** A copy is behind its library plan when the library changed after the copy took it; it has
 * your own changes for them when it changed after it was given. */
export function copyState(copy: CoachNutritionPlan, library: CoachNutritionPlan): { behind: boolean; changedForThem: boolean } {
  const took = copy.libraryUpdatedAtMs ?? copy.createdAtMs;
  return { behind: library.updatedAtMs > took, changedForThem: copy.updatedAtMs > copy.createdAtMs + 1000 && copy.updatedAtMs > took + 1000 };
}

/** The copy brought up to your library plan: theirs keeps its id, dates and link. */
export function updatePlanCopy(copy: CoachNutritionPlan, library: CoachNutritionPlan): CoachNutritionPlan {
  const now = nowMs();
  const { id: _i, createdAtMs: _c, fromIso: _f, untilIso: _u, archived: _a, sourcePlanId: _s, ...content } = copyData(library);
  return { ...copy, ...content, libraryUpdatedAtMs: library.updatedAtMs, createdAtMs: now, updatedAtMs: now };
}
