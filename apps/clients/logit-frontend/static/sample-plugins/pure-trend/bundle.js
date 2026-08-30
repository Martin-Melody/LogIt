// Sample nutrition-algorithm plugin — the v1 bundle contract.
// Safe to import locally from /sample-plugins/pure-trend/manifest.json
//
// "Pure Trend": no Mifflin–St Jeor, no activity multiplier. Maintenance is estimated
// straight from energy balance — mean intake minus the weight the trend implies you
// gained/lost — then the goal's deficit/surplus is applied.

export const pluginBundle = {
  formatVersion: 1,
  pluginId: "sample.nutrition-algorithm.pure-trend",
  family: "nutrition-algorithm",
  entryExport: "algorithm",
};

const KCAL_PER_KG = 7700;
const DAY_MS = 86_400_000;

function num(v, d) {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

/** Least-squares slope (units per day) of {day, value} points. */
function slopePerDay(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    sx += p.day; sy += p.value; sxx += p.day * p.day; sxy += p.day * p.value;
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

export const algorithm = {
  id: "sample.nutrition-algorithm.pure-trend",
  name: "Pure Trend",
  description: "Target from your real intake vs. weight trend — no formulae.",
  author: "Logit Samples",
  defaultPreferences: { windowDays: 21, minDays: 10 },
  preferencesSchema: [
    {
      key: "windowDays",
      label: "Trend window",
      description: "How many recent days to fit the trend over.",
      type: "number",
      default: 21,
      min: 14,
      max: 42,
      step: 7,
      unit: "days",
    },
    {
      key: "minDays",
      label: "Minimum logged days",
      description: "Below this, the algorithm won't produce a target.",
      type: "number",
      default: 10,
      min: 7,
      max: 21,
      step: 1,
      unit: "days",
    },
  ],

  computeTargets(input) {
    const prefs = input.userPreferences || {};
    const windowDays = num(prefs.windowDays, 21);
    const minDays = num(prefs.minDays, 10);

    const weigh = (input.weightEntries || []).filter((e) => !e.deletedAtMs);
    const intake = input.dailyIntakeKcal || [];
    if (weigh.length < minDays || intake.length < minDays) {
      return { kcal: 0, sourceLabel: `Needs ~${minDays} days of data` };
    }

    // Daily mean weight, most recent `windowDays`.
    const byDay = new Map();
    for (const e of weigh) {
      const arr = byDay.get(e.dateIso) || [];
      arr.push(e.weightKg);
      byDay.set(e.dateIso, arr);
    }
    const days = [...byDay.keys()].sort();
    const lastMs = Date.parse(days[days.length - 1] + "T00:00:00Z");
    const startMs = lastMs - (windowDays - 1) * DAY_MS;
    const points = days
      .filter((iso) => Date.parse(iso + "T00:00:00Z") >= startMs)
      .map((iso) => {
        const vals = byDay.get(iso);
        return {
          day: Math.round((Date.parse(iso + "T00:00:00Z") - startMs) / DAY_MS),
          value: vals.reduce((a, b) => a + b, 0) / vals.length,
        };
      });
    if (points.length < minDays) return { kcal: 0, sourceLabel: `Needs ~${minDays} days of data` };

    const startIso = new Date(startMs).toISOString().slice(0, 10);
    const lastIso = days[days.length - 1];
    const logged = intake.filter((d) => d.kcal > 0 && d.dateIso >= startIso && d.dateIso <= lastIso);
    if (logged.length < minDays) return { kcal: 0, sourceLabel: `Needs ~${minDays} days of data` };

    const meanIntake = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
    const maintenance = meanIntake - slopePerDay(points) * KCAL_PER_KG;
    if (!Number.isFinite(maintenance) || maintenance <= 0) {
      return { kcal: 0, sourceLabel: "Trend unclear" };
    }

    const rate = Math.abs(num(input.goal.targetRateKgPerWeek, 0));
    const delta = (rate * KCAL_PER_KG) / 7;
    let kcal = maintenance;
    if (input.goal.goalType === "lose") kcal -= delta;
    else if (input.goal.goalType === "gain") kcal += delta;

    return {
      kcal: Math.round(Math.max(1000, kcal)),
      maintenanceKcal: Math.round(maintenance),
      sourceLabel: "Trend",
      notes: "Estimated straight from your logged intake and weight change.",
    };
  },
};
