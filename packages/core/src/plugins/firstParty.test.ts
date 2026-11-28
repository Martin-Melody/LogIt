import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPluginChecks } from "./pluginChecks";
import { runInSandbox } from "./sandbox";

// LogIt's own plugins (plugins/first-party): each one passes the same checks as anyone's. The
// file says the family: block.json, questions.json or a widget's bundle.js.
const ROOT = join(__dirname, "../../../../plugins/first-party");
// The file says the family; a bundle.js says its own (pluginBundle.family).
const FILES: [string, string][] = [
  ["block.json", "workout-block"], ["questions.json", "question-pack"], ["phase.json", "phase-pack"], ["howtos.json", "howto-pack"], ["exercises.json", "exercise-pack"], ["drills.json", "mobility-pack"],
  ["programs.json", "program-pack"], ["recipes.json", "recipe-pack"], ["meal-plans.json", "meal-plan-pack"], ["bundle.js", ""],
];
const NOW = Date.UTC(2026, 10, 27, 12);

describe("LogIt's own plugins", () => {
  for (const id of readdirSync(ROOT).filter((d) => d.startsWith("app.getlogit."))) {
    const files = readdirSync(join(ROOT, id));
    const [file, fromName] = FILES.find(([f]) => files.includes(f)) ?? ["", ""];
    const source = file ? readFileSync(join(ROOT, id, file), "utf8") : "";
    const family = fromName || (/family:\s*"([^"]+)"/.exec(source)?.[1] ?? "");
    it(`${id} (${family}) passes its checks`, async () => {
      expect(file).not.toBe("");
      const result = await runPluginChecks({ family, pluginId: id, source, now: NOW, run: (src, entry, op) => runInSandbox(src, entry, op, { timeoutMs: 2000 }) });
      expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    });
  }

  it("Climbing this week reads Bouldering blocks", async () => {
    const source = readFileSync(join(ROOT, "app.getlogit.climbing-week", "bundle.js"), "utf8");
    const day = 86_400_000;
    const view = (await runInSandbox(source, "widget", { kind: "call", method: "compute", input: { now: NOW, prefs: { weightUnit: "kg" }, workouts: [
      { id: "a", startedAtMs: NOW - day, endedAtMs: NOW - day + 3_600_000, exercises: [], blocks: [{ pluginId: "app.getlogit.boulder", name: "Bouldering", fields: {}, entries: [
        { grade: "V4", result: "Flash", tries: 1 }, { grade: "V5", result: "Sent", tries: 3 }, { grade: "V6", result: "Project", tries: 7 },
      ] }] },
    ] } }, { timeoutMs: 2000 })) as { body: { stats: { label: string; value: string; sublabel?: string }[] }[] };
    expect(view.body[0]!.stats.map((s) => [s.label, s.value])).toEqual([["Sessions", "1"], ["Hardest send", "V5"], ["Tries on projects", "7"]]);
    expect(view.body[0]!.stats[1]!.sublabel).toBe("flash V4");
  });
});
