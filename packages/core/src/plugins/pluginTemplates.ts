import { isCodeFamily } from "./pluginInfo";

/**
 * Starter code for a new plugin in the dashboard's builder: one working example per type, so
 * the preview and checks pass before the author changes a line.
 */

function header(pluginId: string, family: string, entry: string): string {
  return `export const pluginBundle = {
  formatVersion: 1,
  pluginId: ${JSON.stringify(pluginId)},
  family: ${JSON.stringify(family)},
  entryExport: ${JSON.stringify(entry)},
};
`;
}

export function starterSource(family: string, pluginId: string, name: string): string {
  const id = JSON.stringify(pluginId);
  const title = JSON.stringify(name);
  switch (family) {
    case "widget":
      return `${header(pluginId, family, "widget")}
// A card for the home screen and the dashboard's Overview. compute() gets only what
// "needs" asks for and returns what to show; LogIt draws it.
export const widget = {
  id: ${id},
  name: ${title},
  description: "Sessions and sets in the last 7 days.",
  needs: ["workouts"],

  compute(input) {
    const since = input.now - 7 * 24 * 60 * 60 * 1000;
    let sessions = 0;
    let sets = 0;
    for (const w of input.workouts ?? []) {
      if (!w.endedAtMs || w.endedAtMs < since) continue;
      sessions++;
      for (const ex of w.exercises) sets += ex.sets.length;
    }

    if (sessions === 0) {
      return {
        title: ${title},
        body: [],
        empty: { text: "Nothing logged in the last 7 days.", action: { startEmptyWorkout: true } },
      };
    }

    return {
      title: ${title},
      subtitle: "Last 7 days",
      body: [{
        kind: "stat-grid",
        stats: [
          { label: "Sessions", value: String(sessions) },
          { label: "Sets", value: String(sets) },
        ],
      }],
      action: { navigate: "/sessions" },
    };
  },
};
`;
    case "progression-algorithm":
      return `${header(pluginId, family, "algorithm")}
// Suggests the next sets for one exercise. history is most recent first; whatever you
// return as nextState comes back as state next time.
export const algorithm = {
  id: ${id},
  name: ${title},
  description: "Add 2.5 kg once every set hits 8 reps.",
  defaultState: {},

  suggest(input) {
    const last = input.history[0];
    const working = (last?.sets ?? []).filter((s) => s.setType !== "warmup");
    const weight = working[0]?.weight ?? 20;
    const allHit = working.length > 0 && working.every((s) => s.reps >= 8);
    const next = allHit ? weight + 2.5 : weight;
    return {
      sets: [1, 2, 3].map(() => ({ reps: 8, weight: next })),
      nextState: input.state ?? {},
      label: allHit ? "Up 2.5 kg" : "Same weight, aim for 8s",
    };
  },
};
`;
    case "mobility-progression":
      return `${header(pluginId, family, "algorithm")}
// Suggests the next holds or reps for one drill. history is most recent first.
export const algorithm = {
  id: ${id},
  name: ${title},
  description: "Add 5 seconds to your best hold.",
  defaultState: {},

  suggest(input) {
    const best = Math.max(0, ...(input.history[0]?.sets ?? []).map((s) => s.durationSec ?? 0));
    const target = best > 0 ? best + 5 : 30;
    return {
      sets: [{ durationSec: target }],
      nextState: input.state ?? {},
      label: best > 0 ? \`Last best \${best}s → try \${target}s\` : "Start with 30s",
    };
  },
};
`;
    case "analytics":
      return `${header(pluginId, family, "analytics")}
// Charts and numbers for one exercise. history is oldest first.
export const analytics = {
  id: ${id},
  name: ${title},
  description: "Top set per session.",
  metricDefinitions: [{ id: "top", label: "Top set", unit: "kg" }],

  compute(input) {
    const points = input.history.map((h) => ({
      date: h.performedAtMs,
      value: Math.max(0, ...h.sets.map((s) => s.weight)),
    }));
    const best = Math.max(0, ...points.map((p) => p.value));
    return {
      metrics: [{ id: "top", value: best, formatted: best + " kg" }],
      series: [{ metricId: "top", label: "Top set", points }],
    };
  },
};
`;
    case "nutrition-algorithm":
      return `${header(pluginId, family, "algorithm")}
// Sets the daily calorie target from your goal, weight log and diary.
export const algorithm = {
  id: ${id},
  name: ${title},
  description: "Body weight × 30, then the goal's adjustment.",

  computeTargets(input) {
    const kg = input.currentWeightKg ?? 75;
    const maintenance = Math.round(kg * 30);
    return {
      kcal: maintenance - 300,
      maintenanceKcal: maintenance,
      sourceLabel: "Simple",
    };
  },
};
`;
    case "nutrition-analytics":
      return `${header(pluginId, family, "analytics")}
// Numbers and charts over your food diary. days are oldest first.
export const analytics = {
  id: ${id},
  name: ${title},
  description: "Average calories per logged day.",
  metricDefinitions: [{ id: "avg", label: "Average calories", unit: "kcal" }],

  compute(input) {
    const totals = input.days.map((d) => d.items.reduce((sum, item) => sum + item.computed.kcal, 0));
    const logged = totals.filter((k) => k > 0);
    const avg = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0;
    return {
      metrics: [{ id: "avg", value: avg, formatted: avg + " kcal" }],
      series: [],
    };
  },
};
`;
    case "exercise-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          exercises: [
            { name: "Landmine press", primaryMuscles: ["shoulders"], secondaryMuscles: ["chest", "triceps"], exerciseType: "normal" },
            { name: "Cable crunch", primaryMuscles: ["core"], secondaryMuscles: [], exerciseType: "normal" },
          ],
        },
        null,
        2,
      ) + "\n";
    case "mobility-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          drills: [
            { name: "Couch stretch", area: "hips", defaultMetric: "hold", perSide: true, cues: ["Squeeze the glute of the back leg"] },
            { name: "Thread the needle", area: "t-spine", defaultMetric: "reps", perSide: true },
          ],
        },
        null,
        2,
      ) + "\n";
    case "program-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          programs: [
            {
              name: "Upper / lower",
              description: "4 days a week for lifters with a year or more behind them.",
              rule: { kind: "adaptive" },
              weeks: [
                {
                  id: "w1", weekNumber: 1,
                  days: [
                    { id: "d1", orderIndex: 0, name: "Upper A", blocks: [
                      { type: "strength", id: "b1", orderIndex: 0, exerciseName: "Bench Press", sets: [1, 2, 3].map((n) => ({ id: `s${n}`, orderIndex: n - 1, setType: "normal", repsMin: 6, repsMax: 8 })) },
                      { type: "strength", id: "b2", orderIndex: 1, exerciseName: "Barbell Row", sets: [1, 2, 3].map((n) => ({ id: `r${n}`, orderIndex: n - 1, setType: "normal", repsMin: 8, repsMax: 10 })) },
                    ] },
                  ],
                },
              ],
            },
          ],
        },
        null,
        2,
      ) + "\n";
    default:
      return "";
  }
}

/** File name the builder shows for the source. */
export function sourceFileName(family: string): string {
  return isCodeFamily(family) ? "bundle.js" : family === "mobility-pack" ? "drills.json" : family === "program-pack" ? "programs.json" : "exercises.json";
}

/** Turn a name into the last part of an id: "Weekly swings" -> "weekly-swings". */
export function slugForId(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "my-plugin"
  );
}

/** "alex_b" -> "com.alexb" style prefix for a username. */
export function idPrefixFor(username: string): string {
  const clean = username.toLowerCase().replace(/[^a-z0-9]/g, "") || "me";
  return `com.${clean}`;
}
