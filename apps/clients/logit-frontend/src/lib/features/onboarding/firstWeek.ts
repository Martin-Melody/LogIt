// The first week of a plan from onboarding: "Your first week" on Home (design canvas O7) and,
// when it's done, the week-complete screen (O9), shown once.
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { addDays, dayOfWeek, weekStartIso } from "@logit/core/domain/dateIso";

const PLAN_START_KEY = "logit:onboarding:planStartIso";
const WEEK_DONE_SHOWN_KEY = "logit:onboarding:weekDoneShown";

export function markPlanStarted(todayIso: string): void {
  setAccountItem(PLAN_START_KEY, todayIso);
}

/**
 * The first week runs to the Sunday of the week the plan started, or to the next Sunday when
 * it started on a Friday or the weekend (too little of that week left to count).
 */
export function firstWeekEndIso(startIso: string): string {
  const sunday = addDays(weekStartIso(startIso), 6);
  const wd = dayOfWeek(startIso);
  return wd === 5 || wd === 6 || wd === 0 ? addDays(sunday, 7) : sunday;
}

/** The day the plan from onboarding was saved, if there is one. */
export function planStartIso(): string | undefined {
  return getAccountItem(PLAN_START_KEY) ?? undefined;
}

export function inFirstWeek(todayIso: string): boolean {
  const start = getAccountItem(PLAN_START_KEY);
  return !!start && todayIso >= start && todayIso <= firstWeekEndIso(start);
}

export function weekDoneShown(): boolean {
  return getAccountItem(WEEK_DONE_SHOWN_KEY) === "1";
}

export function markWeekDoneShown(): void {
  setAccountItem(WEEK_DONE_SHOWN_KEY, "1");
}
