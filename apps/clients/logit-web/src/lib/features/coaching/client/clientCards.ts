// What a client's Overview cards are computed from (canvas K3, W4): loaded once per client, only
// for what they share. Food is loaded per period.

import { getWebCoachHabitRepo, getWebDeps, getWebNutritionDeps } from "$lib/deps";
import { coachHabitAsHabit } from "@logit/core/domain/CoachHabit";
import { fetchClientHabitEntries } from "@logit/core/data/remote/remoteCoachHabitRepo";
import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
import { gatherWidgetInputFrom } from "@logit/core/plugins/widgetInputGather";
import type { WidgetDataNeed, WidgetInput } from "@logit/core/plugins/widgetView";
import type { CardCheckin, CoachCardInput, ShareArea } from "@logit/core/domain/coachCards";
import type { Sharing } from "@logit/core/api/coachApi";
import { clientNutritionContext, targetsFor } from "../nutrition/clientNutrition";
import { parseSubmission, type ClientSummary, type CoachingOverview } from "../coachingData";

export type ClientCardData = Omit<CoachCardInput, "now" | "period" | "diaryDays">;

export async function loadClientCardData(c: ClientSummary, o: CoachingOverview): Promise<ClientCardData> {
  const s = c.sharing;
  const nutrition = getWebNutritionDeps(c.id);
  const [sessions, weights, habits, entries, ctx] = await Promise.all([
    s.workouts ? getWebDeps(c.id).workoutRepo.listAllSessions().catch(() => []) : Promise.resolve([]),
    s.bodyweight ? nutrition.nutritionRepo.listWeightEntries().catch(() => []) : Promise.resolve([]),
    getWebCoachHabitRepo().listForRecipient(c.id).catch(() => []),
    s.habits ? fetchClientHabitEntries(c.id).catch(() => []) : Promise.resolve([]),
    s.nutrition ? clientNutritionContext(c.id, s).catch(() => null) : Promise.resolve(null),
  ]);
  let target: ClientCardData["target"] = null;
  if (s.nutrition) {
    const t = ctx?.current
      ? await targetsFor(c.id, ctx.current, {}).catch(() => null)
      : (await getNutritionTargets({ nutritionRepo: nutrition.nutritionRepo, nutritionAlgorithmRegistry: nutrition.nutritionAlgorithmRegistry }).catch(() => null))?.targets ?? null;
    if (t) target = { kcal: t.kcal, proteinG: t.macros?.proteinG ?? null };
  }
  const checkins: CardCheckin[] = s.checkins
    ? o.inbox.filter((i) => i.clientUserId === c.id).flatMap((i) => {
        const submission = parseSubmission(i);
        return submission ? [{ id: i.id, clientId: c.id, submission, reviewed: i.reviewedAtMs != null, schedule: o.schedules.find((x) => x.schedule.id === i.scheduleId)?.schedule ?? null }] : [];
      })
    : [];
  return {
    firstName: c.name.split(" ")[0] || c.name,
    sharing: { workouts: s.workouts, nutrition: s.nutrition, bodyweight: s.bodyweight, habits: s.habits, checkins: s.checkins },
    sessions,
    daysPerWeek: c.program?.state === "running" ? c.program.daysPerWeek : null,
    weights,
    target,
    habits: habits.map((h) => h.habit).filter((h) => !h.archived).map(coachHabitAsHabit),
    habitEntries: entries,
    checkins,
  };
}

/** The share area each widget data need comes from. */
const NEED_AREA: Record<WidgetDataNeed, ShareArea | null> = {
  workouts: "workouts", exercises: null, session: "workouts", todaysPlan: "workouts", progressionTargets: "workouts",
  nutrition: "nutrition", bodyweight: "bodyweight", habits: "habits", mobility: "workouts", nutritionDays: "nutrition",
};
export function missingShares(needs: readonly WidgetDataNeed[], sharing: Sharing): ShareArea[] {
  return [...new Set(needs.map((n) => NEED_AREA[n]).filter((a): a is ShareArea => !!a && !sharing[a]))];
}

/** A widget plugin's input from a client's data, up to the end of the period (canvas W4/W11):
 * only the slices it declared and they share. */
export async function clientWidgetInput(c: ClientSummary, needs: readonly WidgetDataNeed[], untilMs: number): Promise<WidgetInput> {
  const allowed = needs.filter((n) => { const a = NEED_AREA[n]; return !a || c.sharing[a]; });
  const deps = getWebDeps(c.id);
  return gatherWidgetInputFrom(allowed, {
    workoutRepo: {
      listAllSessions: async () => (await deps.workoutRepo.listAllSessions()).filter((x) => x.startedAtMs < untilMs),
      listRecentSessions: async ({ limit }) => (await deps.workoutRepo.listAllSessions()).filter((x) => x.startedAtMs < untilMs).sort((a, b) => b.startedAtMs - a.startedAtMs).slice(0, limit),
    },
    exerciseRepo: deps.exerciseRepo,
    nutritionDeps: getWebNutritionDeps(c.id),
    habitRepo: {
      listHabits: async () => (await getWebCoachHabitRepo().listForRecipient(c.id)).map((h) => h.habit).filter((h) => !h.archived).map(coachHabitAsHabit),
      listEntries: async (opts) => (await fetchClientHabitEntries(c.id)).filter((e) => (!opts?.fromIso || e.dateIso >= opts.fromIso) && (!opts?.toIso || e.dateIso <= opts.toIso)),
    },
    weightUnit: "kg",
  }, untilMs);
}
