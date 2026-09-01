import { describe, expect, it } from "vitest";
import {
  buildRunnerCode,
  parseEnvelope,
  SANDBOX_RESULT_GLOBAL,
  stripExports,
  type SandboxOp,
} from "./sandboxProtocol";

/** Emulate the sandbox's "global eval + read result global" contract with Function. */
function runInFakeSandbox(code: string): string {
  const g: Record<string, unknown> = {};
  // eslint-disable-next-line no-new-func
  new Function("globalThis", `${code}`)(g);
  return g[SANDBOX_RESULT_GLOBAL] as string;
}

function run(bundle: string, entry: string, op: SandboxOp) {
  return parseEnvelope(runInFakeSandbox(buildRunnerCode(bundle, entry, op)));
}

describe("stripExports", () => {
  it("hoists named exports to global scope", () => {
    expect(stripExports("export const algorithm = { a: 1 };")).toBe("const algorithm = { a: 1 };");
    expect(stripExports("export function suggest() {}")).toContain("function suggest() {}");
    expect(stripExports("export async function f() {}")).toContain("async function f() {}");
  });

  it("rewrites default exports", () => {
    expect(stripExports("export default { x: 1 };")).toBe("globalThis.__default = { x: 1 };");
  });

  it("drops import and re-export statements", () => {
    const out = stripExports("import x from 'y';\nconst a = 1;\nexport { a };");
    expect(out).toContain("const a = 1;");
    expect(out).not.toContain("import");
    expect(out).not.toContain("export {");
  });
});

describe("buildRunnerCode", () => {
  const bundle = `
export const pluginBundle = { formatVersion: 1, pluginId: "x", family: "progression-algorithm", entryExport: "algorithm" };
export const algorithm = {
  id: "x", name: "X", defaultState: { w: 20 },
  suggest(input) { return { sets: [{ reps: 5, weight: input.state.w + 2.5 }], nextState: input.state }; },
};`;

  it("returns plugin metadata", () => {
    const env = run(bundle, "algorithm", { kind: "meta" });
    expect(env).toEqual({
      ok: true,
      value: expect.objectContaining({ id: "x", name: "X", defaultState: { w: 20 } }),
    });
  });

  it("calls a method with input", () => {
    const env = run(bundle, "algorithm", { kind: "call", method: "suggest", input: { state: { w: 100 } } });
    expect(env.ok).toBe(true);
    if (env.ok) expect(env.value).toMatchObject({ sets: [{ reps: 5, weight: 102.5 }] });
  });

  it("errors when the method is missing", () => {
    const env = run(bundle, "algorithm", { kind: "call", method: "computeTargets", input: {} });
    expect(env).toEqual({ ok: false, error: expect.stringMatching(/computeTargets/) });
  });

  it("catches a throwing plugin", () => {
    const bad = `export const algorithm = { suggest() { throw new Error("boom"); } };`;
    const env = run(bad, "algorithm", { kind: "call", method: "suggest", input: {} });
    expect(env).toEqual({ ok: false, error: expect.stringMatching(/boom/) });
  });

  it("resolves a default export entry", () => {
    const d = `export default { suggest() { return { ok: 1 }; } };`;
    const env = run(d, "default", { kind: "call", method: "suggest", input: {} });
    expect(env).toEqual({ ok: true, value: { ok: 1 } });
  });

  it("errors when no entry is found", () => {
    const env = run(`const nothing = 1;`, "algorithm", { kind: "meta" });
    expect(env).toEqual({ ok: false, error: expect.stringMatching(/entry not found/) });
  });
});

describe("parseEnvelope", () => {
  it("handles malformed JSON", () => {
    expect(parseEnvelope("not json")).toEqual({ ok: false, error: expect.any(String) });
  });
});
