#!/usr/bin/env node

// src/validate.ts
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

// ../core/src/plugins/integrity.ts
var PREFIX = "sha256-";
function toBase64(bytes) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}
async function computeIntegrity(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return PREFIX + toBase64(digest);
}

// ../core/src/plugins/exercisePack.ts
var EXERCISE_PACK_FORMAT_VERSION = 1;
var MAX_PACK_EXERCISES = 500;
var MUSCLE_GROUPS = /* @__PURE__ */ new Set([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "forearms"
]);
var EXERCISE_TYPES = /* @__PURE__ */ new Set([
  "normal",
  "assisted",
  "bodyweight"
]);
function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function coerceMuscles(raw, field, exerciseName) {
  if (raw === void 0 || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`Exercise "${exerciseName}": ${field} must be an array.`);
  }
  const out = [];
  for (const m of raw) {
    if (typeof m !== "string" || !MUSCLE_GROUPS.has(m)) {
      throw new Error(`Exercise "${exerciseName}": unknown muscle group "${String(m)}".`);
    }
    if (!out.includes(m)) out.push(m);
  }
  return out;
}
function parseExercisePack(raw, expectedPluginId) {
  if (!isObject(raw)) {
    throw new Error("Exercise pack must be a JSON object.");
  }
  if (raw.formatVersion !== EXERCISE_PACK_FORMAT_VERSION) {
    throw new Error(
      `Unsupported exercise pack format (expected ${EXERCISE_PACK_FORMAT_VERSION}).`
    );
  }
  if (!isNonEmptyString(raw.pluginId)) {
    throw new Error("Exercise pack is missing a pluginId.");
  }
  if (expectedPluginId && raw.pluginId !== expectedPluginId) {
    throw new Error(
      `Exercise pack pluginId "${raw.pluginId}" does not match manifest "${expectedPluginId}".`
    );
  }
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0) {
    throw new Error("Exercise pack has no exercises.");
  }
  if (raw.exercises.length > MAX_PACK_EXERCISES) {
    throw new Error(`Exercise pack exceeds the ${MAX_PACK_EXERCISES}-exercise limit.`);
  }
  const seen = /* @__PURE__ */ new Set();
  const exercises = [];
  for (const entry of raw.exercises) {
    if (!isObject(entry) || !isNonEmptyString(entry.name)) {
      throw new Error("Every exercise needs a non-empty name.");
    }
    const name = entry.name.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const exerciseType = entry.exerciseType === void 0 ? "normal" : typeof entry.exerciseType === "string" && EXERCISE_TYPES.has(entry.exerciseType) ? entry.exerciseType : (() => {
      throw new Error(`Exercise "${name}": invalid exerciseType.`);
    })();
    exercises.push({
      name,
      primaryMuscles: coerceMuscles(entry.primaryMuscles, "primaryMuscles", name),
      secondaryMuscles: coerceMuscles(entry.secondaryMuscles, "secondaryMuscles", name),
      exerciseType,
      notes: isNonEmptyString(entry.notes) ? entry.notes.trim() : null
    });
  }
  if (exercises.length === 0) {
    throw new Error("Exercise pack has no usable exercises.");
  }
  return {
    formatVersion: EXERCISE_PACK_FORMAT_VERSION,
    pluginId: raw.pluginId,
    exercises
  };
}

// src/manifest.ts
var PLUGIN_FAMILIES = [
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
  "exercise-pack"
];
var CODE_FAMILIES = /* @__PURE__ */ new Set([
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics"
]);
var isStr = (v) => typeof v === "string" && v.trim().length > 0;
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var CAPABILITY_ID_FIELD = {
  widget: "widgetId",
  "progression-algorithm": "algorithmId",
  analytics: "analyticsId",
  "nutrition-algorithm": "algorithmId",
  "nutrition-analytics": "analyticsId",
  "exercise-pack": "exercisePackId"
};
function validateManifest(raw) {
  const errors = [];
  const push = (m) => errors.push(m);
  if (!isObj(raw)) return { valid: false, errors: ["manifest is not a JSON object"] };
  if (!isStr(raw.id)) push("id: required non-empty string");
  if (!PLUGIN_FAMILIES.includes(raw.family)) {
    push(`family: must be one of ${PLUGIN_FAMILIES.join(", ")}`);
  }
  if (!isStr(raw.name)) push("name: required non-empty string");
  if (typeof raw.description !== "string") push("description: required string");
  if (!isStr(raw.version)) push("version: required non-empty string");
  else if (!/^\d+\.\d+\.\d+/.test(raw.version)) push("version: should be semver-ish (x.y.z)");
  if (raw.integrity !== void 0 && !/^sha256-[A-Za-z0-9+/=]+$/.test(String(raw.integrity))) {
    push("integrity: must be `sha256-<base64>`");
  }
  if (raw.minAppVersion !== void 0 && !isStr(raw.minAppVersion)) {
    push("minAppVersion: must be a string");
  }
  const d = raw.distribution;
  if (!isObj(d)) {
    push("distribution: required object");
  } else {
    const origin = d.origin;
    if (origin === "url") {
      if (!isStr(d.manifestUrl)) push("distribution.manifestUrl: required for origin 'url'");
      if (!isStr(d.bundleUrl)) push("distribution.bundleUrl: required (path to the bundle/data file)");
    } else if (origin === "inline") {
      if (d.data === void 0 || d.data === null) push("distribution.data: required for origin 'inline'");
      if (raw.family !== "exercise-pack") push("distribution 'inline' is only allowed for exercise-pack");
    } else {
      push("distribution.origin: registry plugins must use 'url' (or 'inline' for packs)");
    }
  }
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length === 0) {
    push("capabilities: required non-empty array");
  } else {
    const family = raw.family;
    const idField = CAPABILITY_ID_FIELD[family];
    for (const [i, cap] of raw.capabilities.entries()) {
      if (!isObj(cap)) {
        push(`capabilities[${i}]: not an object`);
        continue;
      }
      if (cap.family !== family) push(`capabilities[${i}].family: must match manifest family "${family}"`);
      if (idField && !isStr(cap[idField])) push(`capabilities[${i}].${idField}: required non-empty string`);
      if (idField && isStr(cap[idField]) && isStr(raw.id) && cap[idField] !== raw.id) {
        push(`capabilities[${i}].${idField}: should equal the manifest id`);
      }
    }
  }
  return errors.length === 0 ? { valid: true, errors, manifest: raw } : { valid: false, errors };
}

// ../core/src/plugins/sandboxProtocol.ts
var SAFE_IDENT = /^[A-Za-z_$][\w$]*$/;
var RESERVED = /* @__PURE__ */ new Set([
  "default",
  "export",
  "import",
  "const",
  "let",
  "var",
  "function",
  "class",
  "return",
  "typeof",
  "new",
  "delete",
  "void",
  "in",
  "of",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "this",
  "super",
  "null",
  "true",
  "false",
  "undefined"
]);
function safeEntryRef(entryExport) {
  return SAFE_IDENT.test(entryExport) && !RESERVED.has(entryExport) ? entryExport : null;
}
function stripExports(source) {
  return source.replace(/^\s*import[^;]*;?\s*$/gm, "").replace(/^\s*export\s+default\s+/gm, "globalThis.__default = ").replace(/^\s*export\s+(async\s+function|function|class|const|let|var)\s/gm, "$1 ").replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
}
function extractEntryExport(source) {
  const m = source.match(/entryExport\s*:\s*["'`]([A-Za-z_$][\w$]*)["'`]/);
  return m ? m[1] : null;
}
function parseEnvelope(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "sandbox returned invalid JSON" };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "sandbox returned a non-object" };
  }
  const rec = raw;
  if (rec.__error !== void 0) {
    return { ok: false, error: String(rec.__error) };
  }
  return { ok: true, value: rec.__ok };
}
var SANDBOX_RESULT_GLOBAL = "__pluginResult";
function buildRunnerCode(source, entryExport, op) {
  const entryRef = safeEntryRef(entryExport);
  const byName = entryRef ? `(typeof ${entryRef} !== "undefined" && ${entryRef}) ||` : "";
  const body = op.kind === "meta" ? `return { __ok: {
           id: __e.id, name: __e.name, description: __e.description, author: __e.author,
           defaultState: __e.defaultState,
           defaultPreferences: __e.defaultPreferences,
           preferencesSchema: __e.preferencesSchema,
           metricDefinitions: __e.metricDefinitions
         } };` : `var __fn = __e[${JSON.stringify(op.method)}];
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

// src/sandboxCheck.ts
var METHOD_BY_FAMILY = {
  "progression-algorithm": "suggest",
  analytics: "compute",
  "nutrition-algorithm": "computeTargets",
  "nutrition-analytics": "compute"
};
var modulePromise = null;
async function getModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ newQuickJSWASMModuleFromVariant }, variant] = await Promise.all([
        import("quickjs-emscripten-core"),
        import("@jitl/quickjs-singlefile-browser-release-sync")
      ]);
      return newQuickJSWASMModuleFromVariant(variant.default);
    })();
  }
  return modulePromise;
}
function evalOnce(mod, code, timeoutMs) {
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
async function checkBundleInSandbox(source, family, pluginId) {
  const errors = [];
  if (/^\s*import\s.+\sfrom\s/m.test(source)) {
    errors.push("bundle has `import` statements \u2014 it must be a single file (esbuild --bundle)");
  }
  const entry = extractEntryExport(source) ?? (family === "widget" ? "widget" : "algorithm");
  let mod;
  try {
    mod = await getModule();
  } catch (e) {
    return { ok: false, errors: [`could not start the sandbox engine: ${e.message}`] };
  }
  let meta;
  try {
    const code = `${buildRunnerCode(source, entry, { kind: "meta" })}
;globalThis.${SANDBOX_RESULT_GLOBAL};`;
    const env = parseEnvelope(evalOnce(mod, code, 2e3));
    if (!env.ok) {
      errors.push(`bundle failed to load: ${env.error}`);
    } else {
      meta = env.value;
    }
  } catch (e) {
    errors.push(`bundle threw while loading: ${e.message}`);
  }
  const method = METHOD_BY_FAMILY[family];
  if (method && errors.length === 0) {
    try {
      const code = `${buildRunnerCode(source, entry, { kind: "call", method, input: {} })}
;globalThis.${SANDBOX_RESULT_GLOBAL};`;
      const env = parseEnvelope(evalOnce(mod, code, 2e3));
      if (!env.ok && /has no /.test(env.error)) {
        errors.push(`entry export "${entry}" has no ${method}() \u2014 required for ${family}`);
      }
    } catch (e) {
      errors.push(`calling ${method}() crashed the sandbox: ${e.message}`);
    }
  }
  if (meta && pluginId && meta.id && meta.id !== pluginId) {
    errors.push(`bundle's declared id "${String(meta.id)}" != manifest id "${pluginId}"`);
  }
  return { ok: errors.length === 0, errors, meta };
}

// src/validate.ts
var KNOWN_FAMILIES = /* @__PURE__ */ new Set([
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
  "exercise-pack"
]);
var isStr2 = (v) => typeof v === "string" && v.trim().length > 0;
function localPath(root, url) {
  if (/^https?:\/\//i.test(url)) return null;
  return resolve(root, url.replace(/^\//, ""));
}
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
function sha256(text) {
  return "sha256-" + createHash("sha256").update(text, "utf8").digest("base64");
}
async function validateRegistry(registryDir, opts = {}) {
  const problems = [];
  const root = resolve(registryDir);
  const registryPath = join(root, "registry.json");
  let entries;
  try {
    entries = await readJson(registryPath);
  } catch (e) {
    return [{ where: "registry.json", message: `unreadable / invalid JSON: ${e.message}` }];
  }
  if (!Array.isArray(entries)) {
    return [{ where: "registry.json", message: "must be a JSON array of entries" }];
  }
  const seenIds = /* @__PURE__ */ new Set();
  for (const [i, entry] of entries.entries()) {
    const at = `registry.json[${i}]`;
    if (!entry || typeof entry !== "object") {
      problems.push({ where: at, message: "not an object" });
      continue;
    }
    const e = entry;
    for (const field of ["id", "name", "description", "family", "manifestUrl"]) {
      if (field === "description" ? typeof e[field] !== "string" : !isStr2(e[field])) {
        problems.push({ where: at, message: `${field}: required` });
      }
    }
    if (isStr2(e.family) && !KNOWN_FAMILIES.has(e.family)) {
      problems.push({ where: at, message: `family: unknown "${e.family}"` });
    }
    if (isStr2(e.id)) {
      if (seenIds.has(e.id)) problems.push({ where: at, message: `duplicate id "${e.id}"` });
      seenIds.add(e.id);
    }
    if (!isStr2(e.manifestUrl)) continue;
    const manifestPath = localPath(root, e.manifestUrl);
    if (!manifestPath) {
      problems.push({
        where: at,
        message: `manifestUrl "${e.manifestUrl}" is remote \u2014 publish the plugin files into this repo and use a repo-relative path`
      });
      continue;
    }
    let manifestRaw;
    try {
      manifestRaw = await readJson(manifestPath);
    } catch (err) {
      problems.push({ where: e.manifestUrl, message: `unreadable: ${err.message}` });
      continue;
    }
    const check = validateManifest(manifestRaw);
    for (const msg of check.errors) problems.push({ where: e.manifestUrl, message: msg });
    if (!check.valid || !check.manifest) continue;
    const manifest = check.manifest;
    if (isStr2(e.id) && manifest.id !== e.id) {
      problems.push({ where: e.manifestUrl, message: `manifest id "${manifest.id}" != registry entry id "${e.id}"` });
    }
    if (isStr2(e.family) && manifest.family !== e.family) {
      problems.push({ where: e.manifestUrl, message: `manifest family "${manifest.family}" != registry entry family "${e.family}"` });
    }
    const dist = manifest.distribution;
    if (dist.origin === "inline") {
      try {
        parseExercisePack(dist.data, manifest.id);
      } catch (err) {
        problems.push({ where: e.manifestUrl, message: `inline pack invalid: ${err.message}` });
      }
      continue;
    }
    if (!isStr2(dist.bundleUrl)) continue;
    const artifactPath = localPath(root, dist.bundleUrl);
    if (!artifactPath) {
      problems.push({ where: e.manifestUrl, message: `distribution.bundleUrl "${dist.bundleUrl}" is remote \u2014 use a repo-relative path` });
      continue;
    }
    let artifact;
    try {
      artifact = await readFile(artifactPath, "utf8");
    } catch (err) {
      problems.push({ where: dist.bundleUrl, message: `unreadable: ${err.message}` });
      continue;
    }
    if (!manifest.integrity) {
      problems.push({
        where: e.manifestUrl,
        message: `integrity: required for published plugins \u2014 add "integrity": "${await computeIntegrity(artifact)}"`
      });
    } else if (manifest.integrity !== sha256(artifact)) {
      problems.push({
        where: e.manifestUrl,
        message: `integrity mismatch \u2014 the artifact hashes to ${sha256(artifact)}`
      });
    }
    if (manifest.family === "exercise-pack") {
      try {
        const parsed = JSON.parse(artifact);
        parseExercisePack(parsed, manifest.id);
      } catch (err) {
        problems.push({ where: dist.bundleUrl, message: `exercise pack invalid: ${err.message}` });
      }
    } else if (CODE_FAMILIES.has(manifest.family) && !opts.skipSandbox) {
      const result = await checkBundleInSandbox(artifact, manifest.family, manifest.id);
      for (const msg of result.errors) problems.push({ where: dist.bundleUrl, message: msg });
    }
  }
  return problems;
}

// src/bin.ts
async function main() {
  const dir = process.argv[2] ?? ".";
  const problems = await validateRegistry(dir);
  if (problems.length === 0) {
    console.log("\u2713 registry is valid");
    process.exit(0);
  }
  console.error(`
\u2717 ${problems.length} problem${problems.length === 1 ? "" : "s"}:
`);
  for (const p of problems) {
    console.error(`  ${p.where}
    ${p.message}
`);
  }
  process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
