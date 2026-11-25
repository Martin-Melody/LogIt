// The numbers this phone puts on the boards (design canvas G4, B2): from the weekly streak
// (planned = this week's target after pauses, done, weeks kept) and the volume of finished
// workouts. Volume is per workout against the last four weeks' per-workout average, so a
// Tuesday with one big session isn't "−70%" against a whole week.

/** Volume per workout this week against the usual, in whole percent; null without a usual. */
export function volumeVsUsual(sessions: { startedAtMs: number; volumeKg: number }[], weekStartMs: number): number | null {
  const fourWeeksBefore = weekStartMs - 28 * 86_400_000;
  const avg = (list: { volumeKg: number }[]) => (list.length ? list.reduce((s, x) => s + x.volumeKg, 0) / list.length : 0);
  const thisWeek = sessions.filter((s) => s.startedAtMs >= weekStartMs && s.volumeKg > 0);
  const before = sessions.filter((s) => s.startedAtMs >= fourWeeksBefore && s.startedAtMs < weekStartMs && s.volumeKg > 0);
  if (thisWeek.length === 0 || before.length === 0) return null;
  return Math.round((avg(thisWeek) / avg(before) - 1) * 100);
}
