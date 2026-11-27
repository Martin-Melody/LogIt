// Whether a day has training, for a meal plan with training and rest days (canvas MP2:
// "Training days follow her program's weekdays"). A workout started that day counts; else a
// program running then with a day set for that weekday.

import { getProgramProgress, type CoachProgram } from "./CoachProgram";
import type { WorkoutSession } from "./workout";

const isoOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function isTrainingDay(dateIso: string, programs: CoachProgram[], sessions: Pick<WorkoutSession, "startedAtMs">[]): boolean {
  if (sessions.some((s) => isoOf(s.startedAtMs) === dateIso)) return true;
  const noon = Date.parse(`${dateIso}T12:00:00`);
  const weekday = new Date(noon).getDay();
  return programs.some((p) => {
    if (p.archived) return false;
    const progress = getProgramProgress(p, noon);
    if (progress.status !== "running") return false;
    const week = p.weeks.find((w) => w.weekNumber === progress.weekNumber);
    return !!week?.days.some((d) => d.weekday === weekday);
  });
}

/** That day's session time from the program ("18:00"), for meals timed around training. */
export function sessionTimeOn(dateIso: string, programs: CoachProgram[]): string | null {
  const noon = Date.parse(`${dateIso}T12:00:00`);
  const weekday = new Date(noon).getDay();
  for (const p of programs) {
    if (p.archived) continue;
    const progress = getProgramProgress(p, noon);
    if (progress.status !== "running") continue;
    const day = p.weeks.find((w) => w.weekNumber === progress.weekNumber)?.days.find((d) => d.weekday === weekday && d.sessionTime);
    if (day?.sessionTime) return day.sessionTime;
  }
  return null;
}
