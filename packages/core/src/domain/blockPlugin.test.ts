import { describe, expect, it } from "vitest";
import {
  addEntry, addPluginBlock, newPluginBlockData, parseBlockDeclaration, pluginBlockActiveSec, renderSummary,
  setBlockFieldValue, setEntryDone, setEntryValue, updatePluginBlock, type PluginBlockData,
} from "./blockPlugin";
import type { WorkoutSession } from "./workout";

export const BJJ = {
  id: "app.getlogit.bjj-rounds",
  name: "BJJ rounds",
  entry: { one: "Round", many: "Rounds" },
  blockFields: [{ key: "gi", type: "choice", label: "Gi or no-gi", options: ["Gi", "No-gi"], remember: true }],
  fields: [
    { key: "length", type: "duration", label: "Length", default: 360, timer: "work", column: true },
    { key: "partner", type: "text", label: "Partner", optional: true, suggestions: "previous", column: true, remember: true },
    { key: "finish", type: "choice", label: "Got the sub with", options: "list:submissions", optional: true },
    { key: "subs", type: "counter", label: "Subs", column: true },
    { key: "taps", type: "counter", label: "Tapped", column: true },
  ],
  lists: { submissions: { label: "Submissions", items: ["Rear naked choke", "Armbar", "Triangle"], add: true } },
  timer: { pattern: "rounds", work: "length", rest: { default: 60, label: "Rest" } },
  summary: "{count} rounds · {sum:subs} subs · {sum:taps} tapped",
  countsAs: { activeMinutes: "length" },
};

describe("parseBlockDeclaration", () => {
  it("reads a full declaration", () => {
    const d = parseBlockDeclaration(BJJ, "app.getlogit.bjj-rounds");
    expect(d.fields.map((f) => f.key)).toEqual(["length", "partner", "finish", "subs", "taps"]);
    expect(d.timer).toEqual({ pattern: "rounds", work: "length", rest: { default: 60, label: "Rest" } });
    expect(d.lists?.submissions?.add).toBe(true);
  });

  it.each([
    [{ ...BJJ, id: "other" }, /doesn't match/],
    [{ ...BJJ, fields: [] }, /at least one field/],
    [{ ...BJJ, fields: [{ key: "Bad Key", type: "number", label: "x" }] }, /valid key/],
    [{ ...BJJ, fields: [{ key: "x", type: "colour", label: "x" }] }, /unknown type/],
    [{ ...BJJ, fields: [{ key: "x", type: "choice", label: "x", options: "list:nope" }] }, /doesn't ship/],
    [{ ...BJJ, timer: { pattern: "rounds", work: "subs" } }, /duration field/],
    [{ ...BJJ, timer: { pattern: "emom" } }, /isn't one LogIt runs/],
    [{ ...BJJ, blockFields: [{ key: "subs", type: "number", label: "Dup" }] }, /share the key/],
  ])("refuses what the app can't draw (%#)", (raw, err) => {
    expect(() => parseBlockDeclaration(raw, "app.getlogit.bjj-rounds")).toThrow(err);
  });
});

describe("plugin block data", () => {
  const decl = parseBlockDeclaration(BJJ);

  it("starts with one entry from the defaults and keeps its own shape", () => {
    const d = newPluginBlockData(decl);
    expect(d.entries[0]!.values).toEqual({ length: 360, subs: 0, taps: 0 });
    expect(d.shape.map(([k, , , col]) => [k, col])).toEqual([["length", true], ["partner", true], ["finish", false], ["subs", true], ["taps", true]]);
    expect(d.summary).toBe("0 rounds · 0 subs · 0 tapped");
  });

  it("remembers block fields and remember fields from the last block of the kind", () => {
    const last = { ...newPluginBlockData(decl), blockFields: { gi: "No-gi" } };
    last.entries[0]!.values.partner = "Conor";
    const d = newPluginBlockData(decl, last);
    expect(d.blockFields.gi).toBe("No-gi");
    expect(d.entries[0]!.values.partner).toBe("Conor");
  });

  it("summarises finished entries as values change", () => {
    let s = addPluginBlock({ id: "w", startedAtMs: 0, blocks: [] } as WorkoutSession, decl);
    const blockId = s.blocks[0]!.id;
    const first = (s.blocks[0]!.data as PluginBlockData).entries[0]!.id;
    s = updatePluginBlock(s, blockId, decl, setEntryValue(first, "subs", 2));
    s = updatePluginBlock(s, blockId, decl, setEntryDone(first, true));
    s = updatePluginBlock(s, blockId, decl, addEntry(decl));
    const second = (s.blocks[0]!.data as PluginBlockData).entries[1]!.id;
    s = updatePluginBlock(s, blockId, decl, setEntryValue(second, "taps", 1));
    s = updatePluginBlock(s, blockId, decl, setEntryDone(second, true));
    s = updatePluginBlock(s, blockId, decl, setBlockFieldValue("gi", "Gi"));
    const data = s.blocks[0]!.data as PluginBlockData;
    expect(s.blocks[0]!.type).toBe("plugin:app.getlogit.bjj-rounds");
    expect(data.summary).toBe("2 rounds · 2 subs · 1 tapped");
    expect(pluginBlockActiveSec(decl, data)).toBe(720);
  });

  it("without a template: count and the entry name", () => {
    expect(renderSummary({ entries: [{ id: "a", values: {} }], blockFields: {}, entryName: { one: "Climb", many: "Climbs" } })).toBe("1 climb");
  });
});
