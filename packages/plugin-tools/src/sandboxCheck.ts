import {
  buildRunnerCode,
  extractEntryExport,
  parseEnvelope,
  SANDBOX_RESULT_GLOBAL,
} from "@logit/core/plugins/sandboxProtocol";
import type { PluginFamily } from "./manifest.js";

/**
 * Load a code bundle in a throwaway QuickJS VM and read its metadata — the same
 * `meta` op the app runs at install. Confirms the bundle is a single file, has
 * no imports the sandbox can't resolve, and exposes a usable entry with the
 * method the family needs.
 *
 * quickjs is a peer dep so the linter host installs it once.
 */

const METHOD_BY_FAMILY: Partial<Record<PluginFamily, string>> = {
  "progression-algorithm": "suggest",
  analytics: "compute",
  "nutrition-algorithm": "computeTargets",
  "nutrition-analytics": "compute",
};

export type SandboxCheck = {
  ok: boolean;
  errors: string[];
  meta?: Record<string, unknown>;
};

let modulePromise: Promise<unknown> | null = null;
async function getModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ newQuickJSWASMModuleFromVariant }, variant] = await Promise.all([
        import("quickjs-emscripten-core"),
        import("@jitl/quickjs-singlefile-browser-release-sync"),
      ]);
      return newQuickJSWASMModuleFromVariant(variant.default as never);
    })();
  }
  return modulePromise;
}

function evalOnce(mod: any, code: string, timeoutMs: number): unknown {
  const runtime = mod.newRuntime();
  runtime.setMemoryLimit(48 * 1024 * 1024);
  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const ctx = runtime.newContext();
  try {
    const result = ctx.evalCode(code, "plugin.js", { type: "global" });
    if (result.error) {
      const detail = ctx.dump(result.error);
      result.error.dispose();
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const value = ctx.dump(result.value);
    result.value.dispose();
    return value;
  } finally {
    ctx.dispose();
    runtime.dispose();
  }
}

export async function checkBundleInSandbox(
  source: string,
  family: PluginFamily,
  pluginId: string,
): Promise<SandboxCheck> {
  const errors: string[] = [];

  if (/^\s*import\s.+\sfrom\s/m.test(source)) {
    errors.push("bundle has `import` statements — it must be a single file (esbuild --bundle)");
  }

  const entry = extractEntryExport(source) ?? (family === "widget" ? "widget" : "algorithm");

  let mod: any;
  try {
    mod = await getModule();
  } catch (e) {
    return { ok: false, errors: [`could not start the sandbox engine: ${(e as Error).message}`] };
  }

  // 1. meta
  let meta: Record<string, unknown> | undefined;
  try {
    const code = `${buildRunnerCode(source, entry, { kind: "meta" })}\n;globalThis.${SANDBOX_RESULT_GLOBAL};`;
    const env = parseEnvelope(evalOnce(mod, code, 2000) as string);
    if (!env.ok) {
      errors.push(`bundle failed to load: ${env.error}`);
    } else {
      meta = env.value as Record<string, unknown>;
    }
  } catch (e) {
    errors.push(`bundle threw while loading: ${(e as Error).message}`);
  }

  // 2. the family's method exists and is callable with an empty input
  const method = METHOD_BY_FAMILY[family];
  if (method && errors.length === 0) {
    try {
      const code = `${buildRunnerCode(source, entry, { kind: "call", method, input: {} })}\n;globalThis.${SANDBOX_RESULT_GLOBAL};`;
      const env = parseEnvelope(evalOnce(mod, code, 2000) as string);
      // A thrown error from a real computation on `{}` is fine; a "no method" error is not.
      if (!env.ok && /has no /.test(env.error)) {
        errors.push(`entry export "${entry}" has no ${method}() — required for ${family}`);
      }
    } catch (e) {
      errors.push(`calling ${method}() crashed the sandbox: ${(e as Error).message}`);
    }
  }

  if (meta && pluginId && meta.id && meta.id !== pluginId) {
    errors.push(`bundle's declared id "${String(meta.id)}" != manifest id "${pluginId}"`);
  }

  return { ok: errors.length === 0, errors, meta };
}
