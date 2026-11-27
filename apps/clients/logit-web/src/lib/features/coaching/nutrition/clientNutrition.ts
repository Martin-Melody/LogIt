import { getWebCoachNutritionPlanRepo, getWebCoachProgramRepo, getWebNutritionDeps } from "$lib/deps";
import { coachApi, type Sharing } from "@logit/core/api/coachApi";
import { planOn, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
import { foodsTheyDontEat } from "@logit/core/domain/givingMealPlan";
import { localDateIso, type DietTag, type NutritionGoal } from "@logit/core/domain/nutrition";
import { getNutritionTargets, type ResolvedTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
import { smoothWeightSeries } from "@logit/core/nutrition/trend";
import { currentProgram, parseSubmission, type ProgramStatus } from "../coachingData";

/** What giving a plan, or a client's Nutrition tab, needs to know about them (canvas MP5, MP6). */
export type ClientNutritionContext = {
  goal: NutritionGoal | null;
  /** 7-day average weight, kg. */
  weightKg: number | null;
  weeklyRateKg: number | null;
  /** Their meal plans from you, ended ones too. */
  plans: CoachNutritionPlan[];
  /** The one that applies today. */
  current: CoachNutritionPlan | null;
  /** From their start-up form (canvas J3). */
  avoid: DietTag[];
  program: ProgramStatus | null;
};

export async function clientNutritionContext(clientId: string, sharing: Pick<Sharing, "nutrition" | "bodyweight" | "checkins">): Promise<ClientNutritionContext> {
  const repo = getWebNutritionDeps(clientId).nutritionRepo;
  const [rows, goal, weights, programs, inbox] = await Promise.all([
    getWebCoachNutritionPlanRepo().listMine({ recipientId: clientId }).catch(() => []),
    sharing.nutrition ? repo.getGoal().catch(() => null) : Promise.resolve(null),
    sharing.bodyweight || sharing.nutrition ? repo.listWeightEntries().catch(() => []) : Promise.resolve([]),
    getWebCoachProgramRepo().listMyPrograms({ recipientId: clientId }).catch(() => []),
    sharing.checkins ? coachApi.checkinInbox(365).catch(() => []) : Promise.resolve([]),
  ]);
  const plans = rows.map((r) => r.plan);
  const trend = smoothWeightSeries(weights);
  // The newest start-up answers that say what they don't eat.
  let avoid: DietTag[] = [];
  for (const item of inbox.filter((i) => i.clientUserId === clientId).sort((a, b) => b.submittedAtMs - a.submittedAtMs)) {
    const s = parseSubmission(item);
    const found = s ? foodsTheyDontEat(s.asked, s.answers) : [];
    if (s?.asked?.some((q) => /foods? you don'?t eat/i.test(q.prompt))) {
      avoid = found;
      break;
    }
  }
  return {
    goal,
    weightKg: trend.currentKg ?? null,
    weeklyRateKg: trend.weeklyRateKg ?? null,
    plans,
    current: planOn(plans, localDateIso()),
    avoid,
    program: currentProgram(programs.map((p) => p.program)),
  };
}

/** A plan's targets for them on one kind of day: Adaptive calories from their own goal and diary. */
export async function targetsFor(clientId: string, plan: CoachNutritionPlan, day: { trainingDay?: boolean; dateIso?: string }): Promise<ResolvedTargets | null> {
  const deps = getWebNutritionDeps(clientId);
  const s = await getNutritionTargets({
    nutritionRepo: deps.nutritionRepo,
    nutritionAlgorithmRegistry: deps.nutritionAlgorithmRegistry,
    assignedNutritionPlanRepo: {
      getAssignedPlan: async () => plan,
      listAssignedPlans: async () => [plan],
      upsertFromRemote: async () => {},
      removeFromRemote: async () => {},
    },
  }, { trainingDay: day.trainingDay, dateIso: day.dateIso }).catch(() => null);
  return s?.targets ?? null;
}

/** "Training day 2,100 kcal · rest day 1,850 · protein 140 g", worked out for them. */
export async function targetsLine(clientId: string, plan: CoachNutritionPlan): Promise<{ text: string; days: { name: string; kcal: number }[]; proteinG: number | null }> {
  const types = plan.mode && plan.mode !== "same" ? (plan.dayTypes ?? []) : [];
  const nextWeekday = (w: number) => { const d = new Date(); d.setDate(d.getDate() + ((w - d.getDay() + 7) % 7)); return localDateIso(d); };
  const days = !types.length
    ? [{ name: "Every day", t: await targetsFor(clientId, plan, {}) }]
    : await Promise.all(types.map(async (d) => ({ name: d.name, t: await targetsFor(clientId, plan, plan.mode === "training-rest" ? { trainingDay: d.role === "training" } : { dateIso: nextWeekday(d.weekdays?.[0] ?? 1) }) })));
  const kcal = days.map((d) => ({ name: d.name, kcal: d.t?.kcal ?? 0 }));
  const proteinG = days[0]?.t?.coachSet?.includes("proteinG") ? (days[0]?.t?.macros.proteinG ?? null) : null;
  const k = (n: number) => n.toLocaleString("en-GB");
  const text = [
    types.length ? kcal.map((d, i) => `${i === 0 ? d.name : d.name.toLowerCase()} ${k(d.kcal)}${i === 0 ? " kcal" : ""}`).join(" · ") : `${k(kcal[0]?.kcal ?? 0)} kcal`,
    proteinG ? `protein ${proteinG} g` : null,
  ].filter(Boolean).join(" · ");
  return { text, days: kcal, proteinG };
}
