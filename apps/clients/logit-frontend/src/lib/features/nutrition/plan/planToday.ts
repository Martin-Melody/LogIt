import { getCheckinRepo, getCoachNutritionPlanRepo, getCoachProgramRepo, getNutritionRepo } from "$lib/data/repoProvider";
import { cachedCoaches } from "$lib/features/coaching/coachCache";
import { planOn, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
import { foodsTheyDontEat } from "@logit/core/domain/givingMealPlan";
import { localDateIso, type DietTag, type DiaryDay } from "@logit/core/domain/nutrition";
import { sessionTimeOn } from "@logit/core/domain/trainingDay";
import { getProgramProgress } from "@logit/core/domain/CoachProgram";
import { trainingDayOn } from "../trainingDay";

/** Everything Today's food needs (canvas MP7). */
export type PlanToday = {
  plan: CoachNutritionPlan | null;
  dateIso: string;
  training: boolean;
  /** That day's session ("Upper A at 18:00"), for meals timed to training. */
  session: { name: string; time: string | null } | null;
  avoid: DietTag[];
  coachName: string;
  day: DiaryDay | null;
};

export async function loadPlanToday(dateIso = localDateIso()): Promise<PlanToday> {
  const [all, programs, submissions, day, training] = await Promise.all([
    getCoachNutritionPlanRepo().listPlanHistory?.() ?? getCoachNutritionPlanRepo().listAssignedPlans(),
    getCoachProgramRepo().listAssignedPrograms().catch(() => []),
    getCheckinRepo().listSubmissions().catch(() => []),
    getNutritionRepo().getDay(dateIso).catch(() => null),
    trainingDayOn(dateIso),
  ]);
  const plan = planOn(all, dateIso);
  // Their start-up form's "Foods you don't eat" (canvas J3), newest first.
  let avoid: DietTag[] = [];
  for (const s of [...submissions].sort((a, b) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0))) {
    if (s.asked?.some((q) => /foods? you don'?t eat/i.test(q.prompt))) { avoid = foodsTheyDontEat(s.asked, s.answers); break; }
  }
  const weekday = new Date(`${dateIso}T12:00:00`).getDay();
  let session: PlanToday["session"] = null;
  if (training) {
    for (const p of programs) {
      const progress = getProgramProgress(p, Date.parse(`${dateIso}T12:00:00`));
      if (progress.status !== "running") continue;
      const d = p.weeks.find((w) => w.weekNumber === progress.weekNumber)?.days.find((x) => x.weekday === weekday);
      if (d) { session = { name: d.name ?? "Training", time: sessionTimeOn(dateIso, [p]) }; break; }
    }
  }
  return { plan, dateIso, training, session, avoid, coachName: cachedCoaches()[0]?.name ?? "your coach", day };
}
