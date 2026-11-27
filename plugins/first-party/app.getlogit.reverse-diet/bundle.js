export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.reverse-diet", family: "nutrition-algorithm", entryExport: "algorithm" };

// Reverse diet (seed plugin): after a cut, the target sits a step above what you've been eating,
// so calories climb each week as you eat to it, until your weight starts to rise. Then it holds.
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
  id: "app.getlogit.reverse-diet",
  name: "Reverse diet",
  description: "After a cut, adds calories each week until your weight trend starts to rise.",
  defaultPreferences: { step: 100, proteinPerKg: 2, fatPerKg: 0.8 },
  preferencesSchema: [
    { key: "step", label: "Add each week", type: "number", default: 100, min: 25, max: 250, step: 25, unit: "kcal" },
    { key: "proteinPerKg", label: "Protein", type: "number", default: 2, min: 1.2, max: 3.3, step: 0.1, unit: "g per kg" },
    { key: "fatPerKg", label: "Fat", type: "number", default: 0.8, min: 0.5, max: 1.5, step: 0.1, unit: "g per kg" },
  ],
  computeTargets(input) {
    const p = input.userPreferences ?? {};
    const week = (input.dailyIntakeKcal ?? []).filter((d) => Date.parse(d.dateIso) >= input.now - 7 * DAY);
    if (week.length < 5 || !input.currentWeightKg) return { kcal: 0, sourceLabel: "Log 5 days of food" };
    const eating = Math.round(week.reduce((s, d) => s + d.kcal, 0) / week.length);
    const trend = trendPerWeek(input.weightEntries ?? [], input.now);
    const rising = trend !== null && trend > 0.1;
    const kcal = rising ? eating : eating + Number(p.step ?? 100);
    return {
      kcal,
      macros: macros(kcal, input.currentWeightKg, Number(p.proteinPerKg ?? 2), Number(p.fatPerKg ?? 0.8)),
      maintenanceKcal: rising ? eating : undefined,
      sourceLabel: rising ? "Reverse diet: holding" : "Reverse diet",
      notes: rising ? "Your weight has started to rise, so the target holds at what you eat now." : "You've been eating about " + eating + " kcal; this week's target is a step above.",
    };
  },
};
