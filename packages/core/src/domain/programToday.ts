// A coach's program on the client's Home (decision D2): which of its days is next. The week the
// client is in comes from when they started; inside it, the first day not yet done (a workout
// started from that day, this program week). All done: the next week's first day, on its date.
import { dayForWeek, getProgramProgress, getProgramStartMs, type CoachProgram, type ProgramDay } from "./CoachProgram";
import { weekTypeOf, weekTypeLabel, weekTypeText, type WeekType } from "./weekTypes";
import { stretchesOf, stretchTitle } from "./stretches";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type DoneSession = { startedAtMs: number; source?: { kind: string; parentId: string; dayId: string } | null };

export type ProgramToday = {
  program: CoachProgram;
  weekNumber: number;
  totalWeeks: number;
  /** This week's type (Phase 6.4): its label and one line, for "Week 4 of 6 · Deload: …". */
  weekType: { type: WeekType; label: string; text: string } | null;
  /** The named stretch this week is in (canvas PW1: "Week 5 of 8 · Hypertrophy"), when it isn't
   * the week's type (that shows on its own). */
  stretch: string | null;
  /** When the last week ends (epoch ms). */
  endsAtMs: number;
  /** The program's days done this program week, and the days in it. */
  doneThisWeek: number;
  daysThisWeek: number;
  /** A day of this program was done today. */
  doneToday: ProgramDay[];
  /** The day to start next, and the earliest time it's due (now, or the next week's start). */
  next: { day: ProgramDay; atMs: number } | null;
};

const byOrder = (days: ProgramDay[]) => [...days].sort((a, b) => a.orderIndex - b.orderIndex);

/** Null unless the program is running (started and not finished). */
export function programToday(program: CoachProgram, sessions: DoneSession[], nowMs: number): ProgramToday | null {
  const progress = getProgramProgress(program, nowMs);
  const start = getProgramStartMs(program);
  if (progress.status !== "running" || start == null) return null;
  const weeks = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const week = weeks.find((w) => w.weekNumber === progress.weekNumber);
  if (!week) return null;
  const weekStart = start + (progress.weekNumber - 1) * WEEK_MS;
  const mine = sessions.filter((s) => s.source?.kind === "program" && s.source.parentId === program.id);
  const doneIds = new Set(mine.filter((s) => s.startedAtMs >= weekStart).map((s) => s.source!.dayId));
  // Each day as it is that week: an exercise for part of the program shows only in its weeks (6.7).
  const days = byOrder(week.days).map((d) => dayForWeek(d, week.weekNumber)).filter((d) => d.blocks.length > 0);
  const todayStart = new Date(nowMs).setHours(0, 0, 0, 0);
  const doneToday = days.filter((d) => mine.some((s) => s.source!.dayId === d.id && s.startedAtMs >= todayStart));
  const open = days.find((d) => !doneIds.has(d.id));
  const following = weeks.find((w) => w.weekNumber === progress.weekNumber + 1);
  const nextWeekFirst = following ? byOrder(following.days).map((d) => dayForWeek(d, following.weekNumber)).find((d) => d.blocks.length > 0) : undefined;
  return {
    program,
    weekNumber: progress.weekNumber,
    totalWeeks: weeks.length,
    weekType: (() => { const wt = weekTypeOf(week); return wt ? { type: wt, label: weekTypeLabel(wt), text: weekTypeText(wt) } : null; })(),
    stretch: (() => { const s = stretchesOf(program).find((x) => x.from <= progress.weekNumber && progress.weekNumber <= x.to); return s && !s.plain && s.what.kind !== "week" && s.what.kind !== "find" ? stretchTitle(s) : null; })(),
    endsAtMs: start + weeks.length * WEEK_MS,
    doneThisWeek: days.filter((d) => doneIds.has(d.id)).length,
    daysThisWeek: days.length,
    doneToday,
    next: open ? { day: open, atMs: nowMs } : nextWeekFirst ? { day: nextWeekFirst, atMs: weekStart + WEEK_MS } : null,
  };
}
