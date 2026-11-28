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
    case "card-pack":
      return `${header(pluginId, family, "cards")}
// Cards for a coach's Today and Your month. compute() is called once per card with that
// card's id and your roster (first names, months with you, sessions and program week for
// clients who share workouts, check-ins waiting). Never payments or messages.
export const cards = {
  id: ${id},
  name: ${title},
  cards: [
    { id: "roster", name: "Months with you" },
    { id: "ending", name: "Programs ending soon" },
  ],

  compute(input) {
    if (input.card === "ending") {
      const soon = input.clients.filter((c) => c.program && c.program.endsInDays !== null && c.program.endsInDays <= 14);
      if (soon.length === 0) return { title: "Programs ending soon", body: [], empty: { text: "Nothing ends in the next two weeks." } };
      return {
        title: "Programs ending soon",
        body: [{ kind: "list", items: soon.map((c) => ({ label: c.firstName, sublabel: c.program.name, trailing: c.program.endsInDays === 0 ? "today" : "in " + c.program.endsInDays + " days" })) }],
      };
    }
    if (input.clients.length === 0) return { title: "Months with you", body: [], empty: { text: "No clients yet." } };
    const sorted = [...input.clients].sort((a, b) => b.monthsWithYou - a.monthsWithYou);
    return {
      title: "Months with you",
      subtitle: input.clients.filter((c) => c.joinedThisMonth).length + " new this month",
      body: [{ kind: "list", items: sorted.slice(0, 6).map((c) => ({ label: c.firstName, trailing: c.monthsWithYou + (c.monthsWithYou === 1 ? " month" : " months") })) }],
    };
  },
};
`;
    case "question-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          questions: [
            { prompt: "Finger pain", type: "scale", scaleMin: 1, scaleMax: 10, help: "1 = none, 10 = stop climbing" },
            { prompt: "Skin", type: "choice", options: ["Fine", "Thin", "Split"] },
          ],
        },
        null,
        2,
      ) + "\n";
    case "phase-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          phase: { name: "Technique first", weeks: 2, findsWeights: false },
          includes: [],
        },
        null,
        2,
      ) + "\n";
    case "meal-plan-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          plans: [
            {
              name: "High-protein cut, 1,900 kcal",
              kcalTarget: 1900, proteinG: 160,
              meals: [
                { id: "m1", name: "Breakfast", foods: [{ id: "f1", name: "Greek yogurt, 0%", grams: 300, computed: { kcal: 171, proteinG: 30, carbsG: 12, fatG: 0 } }] },
                { id: "m2", name: "Lunch", foods: [{ id: "f2", name: "Chicken breast, cooked", grams: 200, computed: { kcal: 330, proteinG: 62, carbsG: 0, fatG: 7 } }] },
              ],
            },
          ],
        },
        null,
        2,
      ) + "\n";
    case "recipe-pack":
      return JSON.stringify(
        {
          formatVersion: 1,
          pluginId,
          recipes: [
            {
              name: "Protein oats",
              servings: 1,
              tags: ["vegetarian"],
              minutes: 5,
              ingredients: [
                { id: "i1", name: "Rolled oats", grams: 60, computed: { kcal: 228, proteinG: 8, carbsG: 39, fatG: 4 } },
                { id: "i2", name: "Whey protein", grams: 30, computed: { kcal: 120, proteinG: 24, carbsG: 3, fatG: 2 } },
              ],
            },
          ],
        },
        null,
        2,
      ) + "\n";
    case "workout-block":
      // The declaration is the file (docs/plugin-workout-blocks.md); LogIt draws and times it.
      return JSON.stringify(
        {
          id: pluginId,
          name,
          description: "Timed rounds with rest, for rolling, sparring or bag work.",
          entry: { one: "Round", many: "Rounds" },
          blockFields: [],
          fields: [
            { key: "length", type: "duration", label: "Length", default: 300, timer: "work", column: true },
            { key: "partner", type: "text", label: "Partner", optional: true, suggestions: "previous", column: true },
            { key: "effort", type: "scale", label: "How hard", min: 1, max: 5, optional: true },
            { key: "note", type: "text", label: "Note", multiline: true, optional: true },
          ],
          timer: { pattern: "rounds", work: "length", rest: { default: 60, label: "Rest" } },
          summary: "{count} rounds",
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
  return isCodeFamily(family) ? "bundle.js" : family === "mobility-pack" ? "drills.json" : family === "program-pack" ? "programs.json" : family === "meal-plan-pack" ? "meal-plans.json" : family === "question-pack" ? "questions.json" : family === "phase-pack" ? "phase.json" : family === "recipe-pack" ? "recipes.json" : family === "workout-block" ? "block.json" : "exercises.json";
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
