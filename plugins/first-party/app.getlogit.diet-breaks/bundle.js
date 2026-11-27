export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.diet-breaks", family: "nutrition-algorithm", entryExport: "algorithm" };

// Diet breaks (seed plugin): during a cut, one or two weeks at maintenance every few weeks.
// Weeks count from your first weigh-in in LogIt.
// Shared by LogIt's nutrition seeds (each file stands alone; the sandbox loads one file).
const DAY = 86400000;
const FACTOR = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };
function age(iso, now) { if (!iso) return 35; const b = new Date(iso); return Math.max(16, Math.floor((now - b.getTime()) / (365.25 * DAY))); }
/** Weight change per week from the log: the last 7 days' average against the 7 before. */
function trendPerWeek(entries, now) {
  const kg = (e) => e.weightKg ?? e.kg;
  const inRange = (a, b) => entries.filter((e) => { const t = Date.parse(e.dateIso); return t >= now - a * DAY && t < now - b * DAY; }).map(kg).filter((x) => typeof x === "number");
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const recent = inRange(7, -1), before = inRange(14, 7);
  return recent.length >= 2 && before.length >= 2 ? avg(recent) - avg(before) : null;
}
/** Maintenance: from what you eat and how your weight moves (14+ days logged), else from the formula. */
function maintenance(input) {
  const g = input.goal, w = input.currentWeightKg, now = input.now;
  const days = (input.dailyIntakeKcal ?? []).filter((d) => Date.parse(d.dateIso) >= now - 21 * DAY);
  const trend = trendPerWeek(input.weightEntries ?? [], now);
  if (days.length >= 14 && trend !== null) {
    const intake = days.reduce((s, d) => s + d.kcal, 0) / days.length;
    return { kcal: Math.round(intake - (trend * 7700) / 7), from: "your food and weight" };
  }
  if (!w || !g.heightCm) return null;
  const bmr = 10 * w + 6.25 * g.heightCm - 5 * age(g.birthDateIso, now) + (g.sex === "male" ? 5 : -161);
  return { kcal: Math.round(bmr * (FACTOR[g.activityLevel] ?? 1.55)), from: "your height, age and activity" };
}
/** Daily calories for the goal's pace: about 7,700 kcal a kilo. */
function forGoal(m, g) {
  const rate = Math.abs(Number(g.targetRateKgPerWeek) || 0);
  const delta = g.goalType === "lose" ? -rate * 1100 : g.goalType === "gain" ? rate * 1100 : 0;
  return Math.round(m + delta);
}
function macros(kcal, w, proteinPerKg, fatPerKg) {
  const proteinG = Math.round(w * proteinPerKg), fatG = Math.round(w * fatPerKg);
  return { proteinG, fatG, carbsG: Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4)) };
}

export const algorithm = {
  id: "app.getlogit.diet-breaks",
  name: "Diet breaks",
  description: "During a cut, a week or two at maintenance every set number of weeks.",
  defaultPreferences: { cutWeeks: 8, breakWeeks: 1, proteinPerKg: 2.2, fatPerKg: 0.8 },
  preferencesSchema: [
    { key: "cutWeeks", label: "Weeks of cutting", type: "number", default: 8, min: 3, max: 16, step: 1 },
    { key: "breakWeeks", label: "Then at maintenance for", type: "select", default: 1, options: [{ value: 1, label: "1 week" }, { value: 2, label: "2 weeks" }] },
    { key: "proteinPerKg", label: "Protein", type: "number", default: 2.2, min: 1.2, max: 3.3, step: 0.1, unit: "g per kg" },
    { key: "fatPerKg", label: "Fat", type: "number", default: 0.8, min: 0.5, max: 1.5, step: 0.1, unit: "g per kg" },
  ],
  computeTargets(input) {
    const p = input.userPreferences ?? {};
    const w = input.currentWeightKg, m = maintenance(input);
    if (!w || !m) return { kcal: 0, sourceLabel: "Needs your weight and height" };
    const first = (input.weightEntries ?? [])[0];
    const start = first ? Date.parse(first.dateIso) : input.now;
    const cut = Number(p.cutWeeks ?? 8), brk = Number(p.breakWeeks ?? 1);
    const week = Math.floor((input.now - start) / (7 * DAY));
    const inBreak = input.goal.goalType === "lose" && week % (cut + brk) >= cut;
    const kcal = inBreak ? m.kcal : forGoal(m.kcal, input.goal);
    const left = inBreak ? cut + brk - (week % (cut + brk)) : cut - (week % (cut + brk));
    return {
      kcal,
      macros: macros(kcal, w, Number(p.proteinPerKg ?? 2.2), Number(p.fatPerKg ?? 0.8)),
      maintenanceKcal: m.kcal,
      sourceLabel: inBreak ? "Diet break" : "Cut",
      notes: inBreak ? "Diet break: at maintenance for " + left + " more week" + (left === 1 ? "" : "s") + "." : input.goal.goalType === "lose" ? "Cutting; a diet break in " + left + " week" + (left === 1 ? "" : "s") + "." : "Diet breaks only happen when your goal is to lose weight.",
    };
  },
};
