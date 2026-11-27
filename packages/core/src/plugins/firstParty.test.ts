import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPluginChecks } from "./pluginChecks";

// LogIt's own plugins (plugins/first-party): each one passes the same checks as anyone's.
const ROOT = join(__dirname, "../../../../plugins/first-party");

describe("LogIt's own plugins", () => {
  for (const id of readdirSync(ROOT).filter((d) => d.startsWith("app.getlogit."))) {
    it(`${id} passes its checks`, async () => {
      const source = readFileSync(join(ROOT, id, "block.json"), "utf8");
      const result = await runPluginChecks({ family: "workout-block", pluginId: id, source, run: async () => { throw new Error("data, nothing runs"); } });
      expect(result.checks.filter((c) => !c.ok)).toEqual([]);
      expect(result.checks.find((c) => c.id === "pack")?.ok).toBe(true);
    });
  }
});
