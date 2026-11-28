import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBlockDeclaration, setEntryValue, updatePluginBlock, type PluginBlockData } from "./blockPlugin";
import { FIND_YOUR_WEIGHTS_PACK, WEIGHT_FINDER_ID, putPhase, type CoachProgram } from "./CoachProgram";
import { loggedExercises } from "./loggedSets";
import { programDaySession } from "./programDaySession";
import { pluginsNeeded } from "./programPlan";
import { parsePhasePack } from "../plugins/phasePack";

const ROOT = join(__dirname, "../../../../plugins/first-party");
const decl = parseBlockDeclaration(JSON.parse(readFileSync(join(ROOT, "app.getlogit.weight-finder/block.json"), "utf8")), WEIGHT_FINDER_ID);
const sets = [0, 1, 2].map((k) => ({ id: `s${k}`, orderIndex: k, setType: "normal" as const, reps: 6 }));
const day = { id: "d", orderIndex: 0, blocks: [{ type: "strength" as const, id: "sq", orderIndex: 0, exerciseName: "Back squat", sets }] };
const program = putPhase(
  { id: "p", name: "P", weeks: [1, 2].map((n) => ({ id: `w${n}`, weekNumber: n, days: [day] })) } as unknown as CoachProgram,
  { id: "f", name: "Find your weights", weeks: { from: 1, to: 1 }, findsWeights: true, blockPluginId: WEIGHT_FINDER_ID, pack: FIND_YOUR_WEIGHTS_PACK },
);

describe("Find your weights pack (6.10)", () => {
  it("the pack reads, and lists its block", () => {
    const pack = parsePhasePack(JSON.parse(readFileSync(join(ROOT, "app.getlogit.find-your-weights/phase.json"), "utf8")), FIND_YOUR_WEIGHTS_PACK.id);
    expect(pack.phase).toMatchObject({ weeks: 1, findsWeights: true, block: WEIGHT_FINDER_ID });
    expect(pluginsNeeded(program).map((n) => [n.pluginId, n.kind])).toEqual([[WEIGHT_FINDER_ID, "block"]]);
  });

  it("in the phase each lift runs as the Weight finder, and its jumps are squat sets", () => {
    let s = programDaySession(day, { phase: program.phases![0], pluginBlock: () => decl, weekNumber: 1 });
    const b = s.blocks[0]!;
    const data = b.data as PluginBlockData;
    expect(data.blockFields.lift).toBe("Back squat");
    expect(data.entries).toHaveLength(3);
    s = updatePluginBlock(s, b.id, decl, setEntryValue(data.entries[0]!.id, "kg", 100));
    s = updatePluginBlock(s, b.id, decl, setEntryValue(data.entries[0]!.id, "reps", 6));
    s = updatePluginBlock(s, b.id, decl, setEntryValue(data.entries[0]!.id, "left", "2"));
    const squat = loggedExercises(s).find((e) => e.exerciseName === "Back squat")!;
    expect(squat.sets[0]).toMatchObject({ weight: 100, reps: 6, rpe: 8 });
  });

  it("without the block on the phone, the lift runs as usual with what to do", () => {
    const s = programDaySession(day, { phase: program.phases![0], pluginBlock: () => null, weekNumber: 1 });
    expect(s.blocks[0]!.type).toBe("strength");
    expect(s.note).toMatch(/Find your weights/);
  });
});
