import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateRegistry } from "../src/validate.js";
import { validateManifest } from "../src/manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, "fixtures", name);

describe("validateRegistry", () => {
  it("passes a well-formed registry (with the real sandbox check)", async () => {
    const problems = await validateRegistry(fixture("good"));
    expect(problems).toEqual([]);
  }, 20000);

  it("catches structural problems in registry + manifest", async () => {
    const messages = (await validateRegistry(fixture("bad"), { skipSandbox: true }))
      .map((p) => p.message)
      .join("\n");
    expect(messages).toMatch(/duplicate id/);
    expect(messages).toMatch(/unreadable/); // plugins/missing/manifest.json
    expect(messages).toMatch(/capabilities\[0\]\.family: must match/);
    expect(messages).toMatch(/version: should be semver/);
  }, 20000);

  it("catches a wrong hash and a bundle missing its method", async () => {
    const messages = (await validateRegistry(fixture("badartifact")))
      .map((p) => p.message)
      .join("\n");
    expect(messages).toMatch(/integrity mismatch/);
    expect(messages).toMatch(/has no suggest\(\)/);
  }, 20000);
});

describe("validateManifest", () => {
  const base = {
    id: "com.x.y",
    family: "analytics",
    name: "Y",
    description: "d",
    version: "1.0.0",
    distribution: { origin: "url", manifestUrl: "m.json", bundleUrl: "b.js" },
    capabilities: [{ family: "analytics", analyticsId: "com.x.y" }],
  };

  it("accepts a good manifest", () => {
    expect(validateManifest(base).valid).toBe(true);
  });

  it("rejects a family/capability mismatch", () => {
    const r = validateManifest({ ...base, capabilities: [{ family: "widget", analyticsId: "com.x.y" }] });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/must match manifest family/);
  });

  it("requires bundleUrl for url distribution", () => {
    const r = validateManifest({ ...base, distribution: { origin: "url", manifestUrl: "m.json" } });
    expect(r.errors.join()).toMatch(/bundleUrl/);
  });

  it("only allows inline for exercise-pack", () => {
    const r = validateManifest({ ...base, distribution: { origin: "inline", data: {} } });
    expect(r.errors.join()).toMatch(/inline.*only allowed for exercise-pack/);
  });
});
