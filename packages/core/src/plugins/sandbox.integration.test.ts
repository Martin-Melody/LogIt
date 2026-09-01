import { describe, expect, it } from "vitest";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import { buildRunnerCode, parseEnvelope, SANDBOX_RESULT_GLOBAL, type SandboxOp } from "./sandboxProtocol";

/**
 * Exercises the real QuickJS-WASM engine against the runner protocol — the same
 * path the app's `lib/plugins/sandbox.ts` takes. Guards the security-critical
 * properties: a plugin runs, and a runaway plugin is interrupted.
 */

const module = await newQuickJSWASMModuleFromVariant(
  variant as Parameters<typeof newQuickJSWASMModuleFromVariant>[0],
);

function run(source: string, entry: string, op: SandboxOp, timeoutMs = 500) {
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const ctx = runtime.newContext();
  try {
    const code = `${buildRunnerCode(source, entry, op)}\n;globalThis.${SANDBOX_RESULT_GLOBAL};`;
    const result = ctx.evalCode(code, "plugin.js", { type: "global" });
    if (result.error) {
      const detail = ctx.dump(result.error);
      result.error.dispose();
      return { interrupted: /interrupt/i.test(JSON.stringify(detail)), error: detail };
    }
    const json = ctx.dump(result.value) as string;
    result.value.dispose();
    return { envelope: parseEnvelope(json) };
  } finally {
    ctx.dispose();
    runtime.dispose();
  }
}

const linearPlus = `
export const pluginBundle = { formatVersion: 1, pluginId: "x", family: "progression-algorithm", entryExport: "algorithm" };
export const algorithm = {
  id: "x", name: "Linear", description: "d", defaultState: { increment: 2.5 },
  suggest(input) {
    const inc = Number(input.state?.increment ?? 2.5);
    const last = Number(input.history?.[0]?.sets?.[0]?.weight ?? 20);
    return { sets: [{ reps: 8, weight: last + inc }], nextState: input.state };
  },
};`;

describe("QuickJS sandbox", () => {
  it("runs a progression plugin's suggest()", () => {
    const { envelope } = run(linearPlus, "algorithm", {
      kind: "call",
      method: "suggest",
      input: { state: { increment: 5 }, history: [{ sets: [{ weight: 100 }] }] },
    });
    expect(envelope).toEqual({ ok: true, value: { sets: [{ reps: 8, weight: 105 }], nextState: { increment: 5 } } });
  });

  it("reads plugin metadata", () => {
    const { envelope } = run(linearPlus, "algorithm", { kind: "meta" });
    expect(envelope?.ok && (envelope.value as { defaultState: unknown }).defaultState).toEqual({
      increment: 2.5,
    });
  });

  it("interrupts an infinite loop", () => {
    const evil = `export const algorithm = { suggest() { while (true) {} } };`;
    const outcome = run(evil, "algorithm", { kind: "call", method: "suggest", input: {} }, 100);
    expect(outcome.interrupted).toBe(true);
  });

  it("has no fetch / process / require in scope", () => {
    const probe = `export const algorithm = { suggest() {
      return { hasFetch: typeof fetch, hasProcess: typeof process, hasRequire: typeof require };
    } };`;
    const { envelope } = run(probe, "algorithm", { kind: "call", method: "suggest", input: {} });
    expect(envelope).toEqual({
      ok: true,
      value: { hasFetch: "undefined", hasProcess: "undefined", hasRequire: "undefined" },
    });
  });

  it("surfaces a thrown plugin error", () => {
    const bad = `export const algorithm = { suggest() { throw new Error("nope"); } };`;
    const { envelope } = run(bad, "algorithm", { kind: "call", method: "suggest", input: {} });
    expect(envelope).toEqual({ ok: false, error: expect.stringMatching(/nope/) });
  });
});
