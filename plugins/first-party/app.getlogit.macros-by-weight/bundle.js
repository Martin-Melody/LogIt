export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.macros-by-weight", family: "nutrition-algorithm", entryExport: "algorithm" };

// Macros by body weight (seed plugin): protein and fat in grams per kg of body weight, carbs
// fill the rest of the calories for your goal.
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
  id: "app.getlogit.macros-by-weight",
  name: "Macros by body weight",
  description: "Protein and fat in g per kg of body weight; carbs fill the rest of the calories for your goal.",
  defaultPreferences: { proteinPerKg: 2, fatPerKg: 0.9 },
  preferencesSchema: [
    { key: "proteinPerKg", label: "Protein", type: "number", default: 2, min: 1.2, max: 3.3, step: 0.1, unit: "g per kg" },
    { key: "fatPerKg", label: "Fat", type: "number", default: 0.9, min: 0.5, max: 1.5, step: 0.1, unit: "g per kg" },
  ],
  computeTargets(input) {
    const w = input.currentWeightKg;
    const m = maintenance(input);
    if (!w || !m) return { kcal: 0, sourceLabel: "Needs your weight and height" };
    const p = input.userPreferences ?? {};
    const kcal = forGoal(m.kcal, input.goal);
    return { kcal, macros: macros(kcal, w, Number(p.proteinPerKg ?? 2), Number(p.fatPerKg ?? 0.9)), maintenanceKcal: m.kcal, sourceLabel: "By body weight", notes: "Maintenance from " + m.from + "." };
  },
};
