import { describe, expect, it } from "vitest";
import { runInSandbox } from "./sandbox";
import { runPluginChecks } from "./pluginChecks";
import { PLUGIN_FAMILIES, getsSummary, pluginGets, readNeedsFromSource, writeNeedsToSource } from "./pluginInfo";
import { starterSource, slugForId, idPrefixFor } from "./pluginTemplates";
import { sampleWidgetInput } from "./sampleInputs";
import { checkWidgetView } from "./widgetViewCheck";
import { installRow, mergeInstallRows, parseInstallRow, readCommunitySetting, removedInstallRow, writeCommunitySetting } from "./pluginInstalls";
import { activityWidget } from "./builtinWidgets/activity";
import { habitsWidget } from "./builtinWidgets/habits";
import { mobilityWidget } from "./builtinWidgets/mobility";
import { muscleFocusWidget } from "./builtinWidgets/muscleFocus";
import { progressionWidget } from "./builtinWidgets/progression";
import { quickStartWidget } from "./builtinWidgets/quickStart";
import { recentSessionsWidget } from "./builtinWidgets/recentSessions";
import { todaysNutritionWidget } from "./builtinWidgets/todaysNutrition";
import { todaysPlanWidget } from "./builtinWidgets/todaysPlan";
import { weightTrendWidget } from "./builtinWidgets/weightTrend";

const NOW = Date.UTC(2026, 10, 16, 12);
const run = (source: string, entry: string, op: Parameters<typeof runInSandbox>[2]) => runInSandbox(source, entry, op, { timeoutMs: 2000 });

describe("starter templates", () => {
  it.each(PLUGIN_FAMILIES)("a new %s passes every check", async (family) => {
    const source = starterSource(family, "com.alex.starter", "Starter");
    const result = await runPluginChecks({ family, pluginId: "com.alex.starter", source, run, now: NOW });
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("names ids from usernames and plugin names", () => {
    expect(idPrefixFor("Alex_B")).toBe("com.alexb");
    expect(slugForId("Weekly swings!")).toBe("weekly-swings");
    expect(slugForId("   ")).toBe("my-plugin");
  });
});

describe("checks catch real mistakes", () => {
  const widget = (body: string, extra = "") => `export const pluginBundle = { formatVersion: 1, pluginId: "com.a.w", family: "widget", entryExport: "widget" };
export const widget = { id: "com.a.w", name: "W", needs: ["workouts"], ${extra}
  compute(input) { ${body} } };`;

  const failed = async (source: string, pluginId = "com.a.w") =>
    (await runPluginChecks({ family: "widget", pluginId, source, run, now: NOW })).checks.filter((c) => !c.ok);

  it("an unknown card part", async () => {
    const bad = await failed(widget(`return { title: "W", body: [{ kind: "stat_grid", stats: [] }] };`));
    expect(bad.map((c) => c.id)).toContain("view");
    expect(bad.find((c) => c.id === "view")!.detail).toContain('"stat_grid"');
  });

  it("an id that doesn't match", async () => {
    const bad = await failed(widget(`return { title: "W", body: [] };`), "com.a.other");
    expect(bad.map((c) => c.id)).toEqual(["id"]);
  });

  it("crashing with nothing logged", async () => {
    const bad = await failed(widget(`const last = input.workouts[0].exercises[0]; return { title: last.name, body: [] };`));
    expect(bad.map((c) => c.id)).toEqual(["empty"]);
  });

  it("asking for data LogIt doesn't have", async () => {
    const source = widget(`return { title: "W", body: [] };`).replace(`needs: ["workouts"]`, `needs: ["location"]`);
    expect((await failed(source)).map((c) => c.id)).toEqual(["needs"]);
  });

  it("a syntax error stops at loading", async () => {
    const result = await runPluginChecks({ family: "widget", pluginId: "com.a.w", source: "export const widget = {", run, now: NOW });
    expect(result.checks.map((c) => [c.id, c.ok])).toEqual([["single-file", true], ["loads", false]]);
  });

  it("imports", async () => {
    const source = `import { x } from "./other.js";\n` + widget(`return { title: "W", body: [] };`);
    expect((await failed(source)).map((c) => c.id)).toContain("single-file");
  });

  it("a broken pack", async () => {
    const result = await runPluginChecks({ family: "exercise-pack", pluginId: "com.a.p", source: `{"formatVersion":1,"pluginId":"com.a.p","exercises":[]}`, run });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.id === "pack")!.detail).toContain("no exercises");
  });
});

describe("the view checker", () => {
  it("accepts every built-in widget with sample and empty data", async () => {
    const widgets = [activityWidget, habitsWidget, mobilityWidget, muscleFocusWidget, progressionWidget, quickStartWidget,
      recentSessionsWidget, todaysNutritionWidget, todaysPlanWidget, weightTrendWidget];
    for (const w of widgets) {
      for (const empty of [false, true]) {
        const view = await w.compute(sampleWidgetInput(w.needs, NOW, empty));
        expect([w.id, empty, checkWidgetView(view)]).toEqual([w.id, empty, []]);
      }
    }
  });

  it("refuses actions outside the allow-list", () => {
    expect(checkWidgetView({ title: "x", body: [], action: { navigate: "https://evil.example" } })[0]).toContain("LogIt page");
    expect(checkWidgetView({ title: "x", body: [], action: { runCode: "x" } })[0]).toContain('"runCode"');
    expect(checkWidgetView({ title: "x", body: [{ kind: "button-row", buttons: [{ label: "Go", action: { cycleDay: 2 } }] }] })[0]).toContain("cycleDay");
  });
});

describe("what a plugin gets", () => {
  it("widgets list their needs; other types have fixed inputs", () => {
    expect(pluginGets("widget", ["habits", "workouts", "nope"]).map((g) => g.label)).toEqual(["Habits", "Recent workouts"]);
    expect(getsSummary("widget", ["workouts", "session"])).toBe("recent workouts, the session you're in");
    expect(getsSummary("exercise-pack", undefined)).toBe("Data only, runs no code");
    expect(pluginGets("progression-algorithm", undefined)[0]!.label).toBe("That exercise's history");
  });

  it("reads and rewrites the needs list in code", () => {
    const src = `export const widget = {\n  needs: ['workouts'],\n};`;
    expect(readNeedsFromSource(src)).toEqual(["workouts"]);
    expect(writeNeedsToSource(src, ["habits", "workouts"])).toContain(`needs: ["workouts", "habits"]`);
    expect(readNeedsFromSource(`needs: [], other: { needs: [] }`)).toBeNull();
    expect(writeNeedsToSource(`no list here`, ["habits"])).toBeNull();
  });
});

describe("synced installs", () => {
  const manifest = { id: "com.a.w", family: "widget", name: "W", version: "1.0.0" };

  it("round-trips, and refuses rows whose manifest isn't theirs", () => {
    const row = installRow({ manifest, enabled: false, installedAtMs: 5, source: "link" }, 10);
    expect(parseInstallRow(row)).toEqual({ manifest, enabled: false, installedAtMs: 5, source: "link" });
    expect(parseInstallRow({ ...row, id: "com.other" })).toBeNull();
    expect(parseInstallRow(removedInstallRow("com.a.w", 5, 20))).toBeNull();
  });

  it("the newer change wins per plugin, and an echo of our own doesn't count as a change", () => {
    const a = installRow({ manifest, enabled: true, installedAtMs: 1, source: "registry" }, 100);
    const local = new Map([[a.id, a]]);
    expect(mergeInstallRows(local, [a]).changed).toEqual([]);
    const off = installRow({ manifest, enabled: false, installedAtMs: 1, source: "registry" }, 200);
    const merged = mergeInstallRows(local, [off]);
    expect(merged.changed).toEqual(["com.a.w"]);
    expect(parseInstallRow(merged.rows.get("com.a.w")!)!.enabled).toBe(false);
    expect(mergeInstallRows(merged.rows, [a]).changed).toEqual([]);
  });

  it("reads the community switch", () => {
    const json = writeCommunitySetting({ enabled: true, acknowledgedRisk: true, updatedAtMs: 3 });
    expect(readCommunitySetting(json)).toEqual({ enabled: true, acknowledgedRisk: true, updatedAtMs: 3 });
    expect(readCommunitySetting(null)).toBeNull();
    expect(readCommunitySetting("{bad")).toBeNull();
  });
});
