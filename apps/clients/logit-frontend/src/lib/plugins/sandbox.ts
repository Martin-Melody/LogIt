import { browser } from "$app/environment";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import {
  buildRunnerCode,
  parseEnvelope,
  SANDBOX_RESULT_GLOBAL,
  type SandboxOp,
} from "@logit/core/plugins/sandboxProtocol";

/**
 * The interpreter sandbox. Community plugin code (progression / nutrition
 * algorithms, analytics) runs here — a QuickJS VM compiled to WASM, embedded
 * in the bundle so it works offline and identically on web, iOS and Android.
 *
 * The plugin gets a bare ES2020 environment: no DOM, no fetch, no storage, no
 * timers. It receives a frozen JSON input and must return a JSON-serialisable
 * value, within a hard wall-clock deadline. A fresh VM per call means no state
 * leaks between plugins or between runs.
 */

const DEFAULT_TIMEOUT_MS = 300;
const DEFAULT_MEMORY_BYTES = 32 * 1024 * 1024;
const STACK_BYTES = 512 * 1024;

export class PluginSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginSandboxError";
  }
}

let modulePromise: Promise<QuickJSWASMModule> | null = null;

function loadModule(): Promise<QuickJSWASMModule> {
  if (!modulePromise) {
    modulePromise = newQuickJSWASMModuleFromVariant(
      variant as Parameters<typeof newQuickJSWASMModuleFromVariant>[0],
    );
  }
  return modulePromise;
}

/** Warm the WASM engine ahead of first use (optional). */
export function preloadSandbox(): void {
  if (browser) void loadModule().catch(() => {});
}

export type SandboxRunOptions = {
  timeoutMs?: number;
  memoryLimitBytes?: number;
};

/**
 * Evaluate `source` (a single-file plugin bundle) in a fresh VM and run one
 * operation against its entry export. Returns the plugin's JSON result, or
 * throws PluginSandboxError on a bad bundle, a thrown plugin error, a timeout,
 * or an out-of-memory.
 */
export async function runInSandbox(
  source: string,
  entryExport: string,
  op: SandboxOp,
  options: SandboxRunOptions = {},
): Promise<unknown> {
  if (!browser) throw new PluginSandboxError("sandbox is browser-only");

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    memoryLimitBytes = DEFAULT_MEMORY_BYTES,
  } = options;

  const mod = await loadModule();
  const runtime = mod.newRuntime();
  runtime.setMemoryLimit(memoryLimitBytes);
  runtime.setMaxStackSize(STACK_BYTES);

  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);

  const ctx = runtime.newContext();
  try {
    const code = `${buildRunnerCode(source, entryExport, op)}\n;globalThis.${SANDBOX_RESULT_GLOBAL};`;
    const result = ctx.evalCode(code, "plugin.js", { type: "global" });

    if (result.error) {
      const detail = ctx.dump(result.error);
      result.error.dispose();
      throw new PluginSandboxError(
        typeof detail === "string" ? detail : (detail?.message ?? JSON.stringify(detail)),
      );
    }

    const json = ctx.dump(result.value) as unknown;
    result.value.dispose();

    if (typeof json !== "string") {
      throw new PluginSandboxError("plugin produced no result");
    }

    const env = parseEnvelope(json);
    if (!env.ok) throw new PluginSandboxError(env.error);
    return env.value;
  } catch (error) {
    if (error instanceof PluginSandboxError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new PluginSandboxError(
      /interrupt/i.test(message) ? `plugin timed out after ${timeoutMs}ms` : message,
    );
  } finally {
    ctx.dispose();
    runtime.dispose();
  }
}
