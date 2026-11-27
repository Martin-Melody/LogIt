import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInSandbox } from "./sandbox";

// What LogIt's own seed plugins do (plugins/first-party), run in the sandbox like any plugin.
const ROOT = join(__dirname, "../../../../plugins/first-party");
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 27, 12);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const call = async (id: string, entry: string, method: string, input: unknown) =>
  runInSandbox(readFileSync(join(ROOT, id, "bundle.js"), "utf8"), entry, { kind: "call", method, input }, { timeoutMs: 2000 }) as Promise<Record<string, any>>;
const set = (weight: number, reps: number) => ({ id: "s", setType: "normal", weight, reps, orderIndex: 0, completed: true });

describe("AMRAP training max", () => {
  it("runs a four-week wave and resets the max from week 3's last set", async () => {
    let state: unknown = {};
    const run = (at: number, sets: ReturnType<typeof set>[]) => call("app.getlogit.amrap-tm", "algorithm", "suggest", { history: [{ sessionId: "x", performedAtMs: at, sets }], state, userPreferences: { increment: 2.5 }, strengthEstimate: { kg: 140 } });
    let out = await run(1, [set(100, 5)]);
    expect(out.label).toBe("Week 1 of 3"); // first use: what's logged doesn't count as week 1
    state = out.nextState;
    out = await run(1.5, [set(95, 5)]); state = out.nextState;
    expect(out.label).toBe("Week 2 of 3"); // a session was logged: on to week 2
    expect((state as { tm: number }).tm).toBe(125); // 90% of 140, rounded
    out = await run(2, [set(110, 3)]); state = out.nextState;
    expect(out.label).toBe("Week 3 of 3");
    out = await run(3, [set(95, 5), set(105, 3), set(120, 4)]); state = out.nextState;
    expect(out.label).toBe("Deload week");
    expect((state as { tm: number }).tm).toBe(Math.round((120 * (1 + 4 / 30) * 0.9) / 2.5) * 2.5);
  });
});

describe("Rep total", () => {
  it("raises the total once it's hit within the set limit", async () => {
    const out = await call("app.getlogit.rep-total", "algorithm", "suggest", { history: [{ performedAtMs: 5, sets: [set(0, 15), set(0, 12), set(0, 12), set(0, 11)] }], state: { total: 50, seenMs: 1 }, userPreferences: { total: 50, maxSets: 6, step: 5 } });
    expect(out.label).toBe("55 reps");
    expect(out.sets.reduce((n: number, s: { reps: number }) => n + s.reps, 0)).toBe(55);
    expect(out.bodyweightLoad).toBe(true);
  });
});

describe("nutrition seeds", () => {
  const goal = { sex: "male", heightCm: 180, birthDateIso: "1996-01-01", activityLevel: "moderate", goalType: "lose", targetRateKgPerWeek: 0.5, proteinGPerKg: 2, fatPct: 0.25, adaptiveEnabled: false };
  const base = { goal, currentWeightKg: 85, weightEntries: [], dailyIntakeKcal: [], userPreferences: {}, now: NOW };
  it("carb cycling keeps the weekly total the same", async () => {
    const day = (trainingDay: boolean | null) => call("app.getlogit.carb-cycling", "algorithm", "computeTargets", { ...base, userPreferences: { shift: 300, trainingDays: 4 }, day: { dateIso: iso(NOW), trainingDay } });
    const [t, r, n] = await Promise.all([day(true), day(false), day(null)]);
    expect(t.kcal - n.kcal).toBe(300);
    expect(Math.abs(t.kcal * 4 + r.kcal * 3 - n.kcal * 7)).toBeLessThanOrEqual(3);
    expect(t.macros.carbsG).toBeGreaterThan(r.macros.carbsG);
  });
  it("diet breaks: maintenance in the break weeks", async () => {
    const start = NOW - 8 * 7 * DAY - DAY; // 8 weeks of cutting behind you
    const out = await call("app.getlogit.diet-breaks", "algorithm", "computeTargets", { ...base, weightEntries: [{ dateIso: iso(start), weightKg: 88 }], userPreferences: { cutWeeks: 8, breakWeeks: 1 } });
    expect(out.sourceLabel).toBe("Diet break");
    expect(out.kcal).toBe(out.maintenanceKcal);
  });
  it("reverse diet steps up, and holds once weight rises", async () => {
    const intake = Array.from({ length: 7 }, (_, i) => ({ dateIso: iso(NOW - (i + 1) * DAY), kcal: 2000 }));
    const up = await call("app.getlogit.reverse-diet", "algorithm", "computeTargets", { ...base, dailyIntakeKcal: intake, userPreferences: { step: 100 } });
    expect(up.kcal).toBe(2100);
    const rising = [...Array.from({ length: 4 }, (_, i) => ({ dateIso: iso(NOW - (10 + i) * DAY), weightKg: 80 })), ...Array.from({ length: 4 }, (_, i) => ({ dateIso: iso(NOW - (1 + i) * DAY), weightKg: 80.5 }))];
    const hold = await call("app.getlogit.reverse-diet", "algorithm", "computeTargets", { ...base, dailyIntakeKcal: intake, weightEntries: rising, userPreferences: { step: 100 } });
    expect(hold.kcal).toBe(2000);
    expect(hold.sourceLabel).toBe("Reverse diet: holding");
  });
  it("macros by body weight: protein and fat per kg, carbs the rest", async () => {
    const out = await call("app.getlogit.macros-by-weight", "algorithm", "computeTargets", { ...base, userPreferences: { proteinPerKg: 2, fatPerKg: 1 } });
    expect(out.macros.proteinG).toBe(170);
    expect(out.macros.fatG).toBe(85);
    expect(Math.abs(out.macros.proteinG * 4 + out.macros.fatG * 9 + out.macros.carbsG * 4 - out.kcal)).toBeLessThanOrEqual(4);
  });
});

describe("roster adherence", () => {
  it("lists the furthest behind first", async () => {
    const view = await call("app.getlogit.roster-adherence", "cards", "compute", { card: "adherence", page: "today", now: NOW, clients: [
      { firstName: "Aoife", monthsWithYou: 3, joinedThisMonth: false, sessions7d: 4, plannedPerWeek: 4, program: null, checkinsToReview: 0, checkinLateDays: 0 },
      { firstName: "Dara", monthsWithYou: 1, joinedThisMonth: true, sessions7d: 1, plannedPerWeek: 3, program: null, checkinsToReview: 0, checkinLateDays: 2 },
    ] });
    expect(view.body[0].items.map((i: { label: string }) => i.label)).toEqual(["Dara", "Aoife"]);
    expect(view.subtitle).toBe("1 of 2 on plan this week");
  });
});
