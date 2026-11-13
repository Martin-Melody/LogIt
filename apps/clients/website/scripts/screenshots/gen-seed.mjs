// Builds sample localStorage for LogIt screenshots: "Alex", upper/lower split by weekday,
// ~10 weeks of training, 3 weeks of food diary, 10 weeks of bodyweight, habits and goals.
// Output: seed.json = { key: string } for localStorage.
import { writeFileSync } from "node:fs";

let n = 0;
const id = (p) => `${p}_seed${(n++).toString(36)}`;
const pad = (x) => String(x).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const TODAY = new Date(2026, 10, 13); // Fri 13 Nov 2026
const START = new Date(2026, 8, 7); // Mon 7 Sep 2026

// ── Split ───────────────────────────────────────────────────────────────
// [exerciseId, name, sets, repsLow, repsHigh, startKg, incKg, everyWeeks, warmups]
const DAYS = [
  { name: "Upper A", weekday: 1, ex: [
    ["ex_core_bench", "Bench Press", 4, 6, 8, 72.5, 2.5, 2, 2],
    ["ex_core_bb_row", "Barbell Row", 4, 8, 10, 65, 2.5, 2, 1],
    ["ex_core_ohp", "Overhead Press", 3, 6, 8, 45, 2.5, 4, 1],
    ["ex_core_lat_pulldown", "Lat Pulldown", 3, 10, 12, 55, 2.5, 3, 0],
    ["ex_core_lat_raise", "Lateral Raise", 3, 12, 15, 10, 2, 5, 0],
    ["ex_core_tricep_push", "Tricep Pushdown", 3, 10, 12, 30, 2.5, 3, 0],
  ]},
  { name: "Lower A", weekday: 2, ex: [
    ["ex_core_squat", "Squat", 4, 5, 6, 110, 5, 2, 2],
    ["ex_core_rdl", "Romanian Deadlift", 3, 8, 10, 90, 2.5, 2, 1],
    ["ex_core_leg_press", "Leg Press", 3, 10, 12, 160, 10, 2, 0],
    ["ex_core_leg_curl", "Leg Curl", 3, 10, 12, 40, 2.5, 3, 0],
    ["ex_core_calf_raise", "Calf Raise", 4, 12, 15, 80, 5, 3, 0],
  ]},
  { name: "Upper B", weekday: 4, ex: [
    ["ex_core_incline_bench", "Incline Bench Press", 4, 8, 10, 60, 2.5, 2, 1],
    ["ex_core_pullup", "Pull-Up", 4, 5, 10, 0, 0, 99, 0],
    ["ex_core_db_row", "Dumbbell Row", 3, 10, 12, 30, 2, 3, 0],
    ["ex_core_chest_fly", "Chest Fly", 3, 12, 15, 14, 2, 4, 0],
    ["ex_core_bicep_curl", "Bicep Curl", 3, 10, 12, 14, 2, 4, 0],
    ["ex_core_skullcrusher", "Skullcrusher", 3, 10, 12, 25, 2.5, 4, 0],
  ]},
  { name: "Lower B", weekday: 5, ex: [
    ["ex_core_deadlift", "Deadlift", 3, 5, 5, 140, 5, 2, 2],
    ["ex_core_front_squat", "Front Squat", 3, 6, 8, 80, 2.5, 2, 1],
    ["ex_core_hip_thrust", "Hip Thrust", 3, 8, 10, 100, 5, 2, 0],
    ["ex_core_leg_ext", "Leg Extension", 3, 12, 15, 50, 2.5, 3, 0],
    ["ex_core_hlr", "Hanging Leg Raise", 3, 8, 15, 0, 0, 99, 0],
  ]},
];

const splitId = id("split");
const created = at(START, 6, 0) - 86400000 * 3;
const split = {
  id: splitId, name: "Upper / Lower", archived: false, createdAtMs: created, updatedAtMs: created,
  schedule: "weekdays",
  days: DAYS.map((d, i) => {
    d.id = id("day");
    return {
      id: d.id, orderIndex: i, name: d.name, weekday: d.weekday,
      blocks: d.ex.map(([exId, name, sets, lo, hi, kg0, inc, every], j) => ({
        type: "strength", id: id("pb"), orderIndex: j, exerciseName: name, exerciseId: exId,
        targets: { sets, reps: lo, weight: kg0 + inc * Math.floor(10 / every) },
      })),
    };
  }),
};

// ── Sessions ────────────────────────────────────────────────────────────
const SKIP = new Set([]);
const sessions = [];
for (let d = START; d < TODAY; d = addDays(d, 1)) {
  const day = DAYS.find((x) => x.weekday === d.getDay());
  if (!day || SKIP.has(iso(d))) continue;
  const week = Math.floor((d - START) / (7 * 86400000));
  let t = at(d, 7, 2 + Math.floor(rnd() * 8));
  const startedAtMs = t;
  const blocks = day.ex.map(([exId, name, nSets, lo, hi, kg0, inc, every, warm], j) => {
    const kg = kg0 + inc * Math.floor(week / every);
    const stepInBlock = week % every;
    const reps = inc === 0 ? Math.min(hi, lo + Math.floor(week / 2)) : Math.min(hi, lo + stepInBlock);
    const sets = [];
    let o = 0;
    for (let w = 0; w < warm; w++) {
      t += 90000;
      const wk = w === 0 && kg >= 40 ? 20 : Math.round((kg * (0.5 + 0.2 * w)) / 2.5) * 2.5;
      sets.push({ id: id("set"), setType: "warmup", reps: w === 0 ? 10 : 5, weight: wk, orderIndex: o++, completed: true });
    }
    for (let s = 0; s < nSets; s++) {
      t += 120000 + Math.floor(rnd() * 40000);
      const last = s === nSets - 1;
      const r = reps;
      sets.push({
        id: id("set"), setType: "normal", reps: r, weight: kg, orderIndex: o++, completed: true,
        rpe: Math.min(10, 7 + s * 0.5 + (rnd() < 0.3 ? 0.5 : 0)),
        restDurationMs: 120000,
      });
    }
    return { id: id("blk"), type: "strength", orderIndex: j, data: { exerciseName: name, exerciseId: exId, sets } };
  });
  sessions.push({
    id: id("ses"), startedAtMs, endedAtMs: t + 300000, blocks,
    name: null,
    source: { kind: "split", parentId: splitId, parentName: split.name, dayId: day.id, dayName: day.name, dayNumber: DAYS.indexOf(day) + 1 },
  });
}

// ── Bodyweight ──────────────────────────────────────────────────────────
const weights = {};
const wStart = addDays(TODAY, -69);
for (let i = 0; i < 70; i++) {
  const d = addDays(wStart, i);
  if (rnd() < 0.15 && i !== 69) continue;
  const kg = Math.round((84.0 + (2.1 * i) / 69 + (rnd() - 0.5) * 0.8) * 10) / 10;
  const wid = id("wt");
  weights[wid] = { id: wid, dateIso: iso(d), weightKg: kg, createdAtMs: at(d, 6, 40), updatedAtMs: at(d, 6, 40) };
}

// ── Food diary ──────────────────────────────────────────────────────────
const F = (name, grams, kcal, p, c, f, brand) => ({ name, grams, brand, computed: { kcal, proteinG: p, carbsG: c, fatG: f } });
const BREAKFAST = [F("Greek yoghurt 0%", 250, 145, 25, 9, 1), F("Porridge oats", 60, 233, 10, 40, 4), F("Banana", 120, 107, 1, 27, 0), F("Semi-skimmed milk", 300, 138, 10, 14, 5)];
const LUNCH = [F("Chicken breast, grilled", 200, 330, 62, 0, 7), F("Basmati rice, cooked", 250, 325, 7, 70, 1), F("Broccoli", 100, 34, 3, 7, 0)];
const SNACKS = [F("Whey protein", 30, 120, 24, 2, 2), F("Bagel with peanut butter", 120, 380, 13, 50, 14)];
const DINNERS = [
  [F("Spaghetti bolognese", 450, 650, 42, 70, 20)],
  [F("Salmon fillet", 180, 370, 36, 0, 24), F("Baby potatoes", 300, 231, 5, 51, 0)],
  [F("Beef burrito bowl", 500, 780, 48, 90, 22)],
  [F("Chicken stir-fry with noodles", 450, 690, 50, 78, 16)],
];
const days = {};
for (let i = 20; i >= 0; i--) {
  const d = addDays(TODAY, -i);
  const items = [];
  const add = (meal, food, h) => items.push({
    id: id("li"), meal, name: food.name, grams: food.grams, servingLabel: `${food.grams} g`, computed: food.computed,
    ...(i === 0 ? { loggedAtMs: at(d, h, 15) } : {}),
  });
  BREAKFAST.forEach((f) => add("breakfast", f, 8));
  LUNCH.forEach((f) => add("lunch", f, 13));
  if (i > 0) {
    add("snack", SNACKS[0], 16);
    if (rnd() < 0.7) add("snack", SNACKS[1], 16);
    DINNERS[i % DINNERS.length].forEach((f) => add("dinner", f, 19));
  }
  const did = `nday_${iso(d)}`;
  days[did] = { id: did, dateIso: iso(d), items, createdAtMs: at(d, 8, 0), updatedAtMs: at(d, 20, 0) };
}
const goal = {
  sex: "male", birthDateIso: "1999-05-01", heightCm: 180, activityLevel: "very", goalType: "gain",
  targetRateKgPerWeek: 0.25, targetWeightKg: 88, proteinGPerKg: 2, fatPct: 0.25, adaptiveEnabled: true,
  updatedAtMs: created,
};

// ── Habits ──────────────────────────────────────────────────────────────
const HABITS = [
  { name: "Walk 10k steps", cadence: { kind: "daily" }, icon: "👟", tone: "green", p: 0.8 },
  { name: "Creatine", cadence: { kind: "daily" }, icon: "💊", tone: "amber", p: 0.92 },
  { name: "In bed by 11", cadence: { kind: "daily" }, icon: "🌙", tone: "primary", p: 0.7 },
  { name: "Mobility, 10 min", cadence: { kind: "weekly", timesPerWeek: 3 }, icon: "🧘", tone: "rose", p: 0.5 },
];
const habits = {};
const entries = {};
HABITS.forEach((h, k) => {
  const hid = id("hab");
  habits[hid] = { id: hid, name: h.name, cadence: h.cadence, icon: h.icon, tone: h.tone, archived: false, createdAtMs: created + k, updatedAtMs: created + k };
  for (let i = 41; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    if (i === 0 && k >= 2) continue; // not done yet today
    if (rnd() > h.p) continue;
    const eid = id("he");
    entries[eid] = { id: eid, habitId: hid, dateIso: iso(d), done: true, createdAtMs: at(d, 21, 0), updatedAtMs: at(d, 21, 0) };
  }
});

// ── Goals ───────────────────────────────────────────────────────────────
const goals = {
  goals: [
    { id: id("goal"), target: { type: "lift", exerciseId: "ex_core_bench", exerciseName: "Bench Press", weightKg: 90, reps: 5 }, deadlineIso: null, createdAtMs: created, updatedAtMs: created },
    { id: id("goal"), target: { type: "lift", exerciseId: "ex_core_squat", exerciseName: "Squat", weightKg: 140, reps: 5 }, deadlineIso: null, createdAtMs: created + 1, updatedAtMs: created + 1 },
    { id: id("goal"), target: { type: "count", metric: "sessions", target: 100, startIso: "2026-09-01" }, deadlineIso: null, createdAtMs: created + 2, updatedAtMs: created + 2 },
  ],
  streak: { weeklyTarget: 4, pauses: [], updatedAtMs: created },
};

const profile = {
  name: "Alex", bio: "", height: 180, heightUnit: "cm", weight: 86.1, weightUnit: "kg",
  blocksCollapsedByDefault: false,
  restDefaults: { normal: 120000, dropset: 30000, failure: 90000 },
  mobilityLeadSide: "left",
};

const out = {
  "logit:onboarding:v1": JSON.stringify({ completed: true, step: 0 }),
  "logit:tours:v1": JSON.stringify({ home: true, session: true, splits: true, splitDetail: true, splitDay: true, exercises: true, profile: true }),
  "mode-watcher-mode": "dark",
  "logit:profile:v1": JSON.stringify(profile),
  "logit:splits:v1": JSON.stringify([split]),
  "logit:activeSplitId:v1": JSON.stringify(splitId),
  "logit:sessions:v1": JSON.stringify(sessions),
  "logit:weightEntries:v1": JSON.stringify(weights),
  "logit:nutritionDays:v1": JSON.stringify(days),
  "logit:nutritionGoal:v1": JSON.stringify(goal),
  "logit:habits:v1": JSON.stringify(habits),
  "logit:habitEntries:v1": JSON.stringify(entries),
  "logit:goals:v1:local": JSON.stringify(goals),
  "logit:plugin-settings:v1": JSON.stringify({ communityPluginsEnabled: true, acknowledgedRisk: true }),
};
writeFileSync(new URL("./seed.json", import.meta.url), JSON.stringify(out));
console.log("sessions", sessions.length, "weights", Object.keys(weights).length, "days", Object.keys(days).length, "entries", Object.keys(entries).length);
