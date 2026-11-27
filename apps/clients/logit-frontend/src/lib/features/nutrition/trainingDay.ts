import { getCoachProgramRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { isTrainingDay } from "@logit/core/domain/trainingDay";

/** Whether a day has training (a workout that day, or a coach program day on that weekday),
 * for a coach's meal plan with training and rest days. False when it can't tell. */
export async function trainingDayOn(dateIso: string): Promise<boolean> {
  try {
    const [programs, sessions] = await Promise.all([
      getCoachProgramRepo().listAssignedPrograms(),
      getWorkoutRepo().listAllSessions(),
    ]);
    return isTrainingDay(dateIso, programs, sessions);
  } catch {
    return false;
  }
}
