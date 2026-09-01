/**
 * Pure helpers for running a plugin bundle inside the interpreter sandbox.
 *
 * A bundle is a single JS file (no imports — the sandbox has no module loader)
 * that declares a `pluginBundle` descriptor and one entry export. We evaluate it
 * in the sandbox's global scope, then a generated runner reads the entry and
 * calls one method with a JSON input, returning a JSON envelope.
 *
 * Nothing here touches WASM — it's all string manipulation, so it's unit-tested
 * independently of the engine.
 */

// A safe bare identifier we can put after `typeof` — excludes reserved words
// that would make `typeof <word>` a syntax error (most relevantly "default").
const SAFE_IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set([
  "default", "export", "import", "const", "let", "var", "function", "class",
  "return", "typeof", "new", "delete", "void", "in", "of", "if", "else", "for",
  "while", "do", "switch", "case", "break", "continue", "this", "super", "null",
  "true", "false", "undefined",
]);

function safeEntryRef(entryExport: string): string | null {
  return SAFE_IDENT.test(entryExport) && !RESERVED.has(entryExport) ? entryExport : null;
}

/**
 * Rewrite `export` declarations so every top-level binding lands in the sandbox
 * global scope. Bundles are the format documented in
 * docs/plugin-bundle-format.md — `export const`, `export function`, `export
 * default`, `export { … }`. Import statements are not supported and are stripped
 * (they would throw in a module-less global eval anyway).
 */
export function stripExports(source: string): string {
  return source
    .replace(/^\s*import[^;]*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "globalThis.__default = ")
    .replace(/^\s*export\s+(async\s+function|function|class|const|let|var)\s/gm, "$1 ")
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
}

/**
 * Best-effort read of the bundle's declared `entryExport` from its `pluginBundle`
 * descriptor, without evaluating anything. Falls back to null; callers then use a
 * family default (`buildRunnerCode` also has runtime fallbacks).
 */
export function extractEntryExport(source: string): string | null {
  const m = source.match(/entryExport\s*:\s*["'`]([A-Za-z_$][\w$]*)["'`]/);
  return m ? m[1]! : null;
}

export type SandboxOp =
  | { kind: "meta" }
  | { kind: "call"; method: string; input: unknown };

/** The value the runner's last expression evaluates to (a JSON string). */
export type SandboxEnvelope =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function parseEnvelope(json: string): SandboxEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "sandbox returned invalid JSON" };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "sandbox returned a non-object" };
  }
  const rec = raw as Record<string, unknown>;
  if (rec.__error !== undefined) {
    return { ok: false, error: String(rec.__error) };
  }
  return { ok: true, value: rec.__ok };
}

/** Global the runner writes its JSON envelope string to. */
export const SANDBOX_RESULT_GLOBAL = "__pluginResult";

/**
 * Build the code string evaluated in the sandbox (a `"global"` eval): the
 * export-stripped bundle, then a statement that resolves the entry, performs
 * `op`, and writes the JSON envelope to `globalThis.__pluginResult`. The host
 * reads that global afterwards.
 */
export function buildRunnerCode(
  source: string,
  entryExport: string,
  op: SandboxOp,
): string {
  const entryRef = safeEntryRef(entryExport);
  const byName = entryRef
    ? `(typeof ${entryRef} !== "undefined" && ${entryRef}) ||`
    : "";
  const body =
    op.kind === "meta"
      ? `return { __ok: {
           id: __e.id, name: __e.name, description: __e.description, author: __e.author,
           defaultState: __e.defaultState,
           defaultPreferences: __e.defaultPreferences,
           preferencesSchema: __e.preferencesSchema,
           metricDefinitions: __e.metricDefinitions
         } };`
      : `var __fn = __e[${JSON.stringify(op.method)}];
         if (typeof __fn !== "function") return { __error: "plugin has no ${op.method}()" };
         return { __ok: __fn.call(__e, ${JSON.stringify(op.input)}) };`;

  return `${stripExports(source)}
globalThis.${SANDBOX_RESULT_GLOBAL} = JSON.stringify((function () {
  var __e =
    ${byName}
    (typeof globalThis.__default !== "undefined" && globalThis.__default) ||
    (typeof algorithm !== "undefined" && algorithm) ||
    (typeof widget !== "undefined" && widget) ||
    null;
  try {
    if (!__e) return { __error: "plugin entry not found" };
    ${body}
  } catch (e) {
    return { __error: String((e && e.message) || e) };
  }
})());`;
}
