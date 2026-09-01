import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { computeIntegrity } from "@logit/core/plugins/integrity";
import { parseExercisePack } from "@logit/core/plugins/exercisePack";
import { CODE_FAMILIES, validateManifest, type PluginFamily } from "./manifest.js";
import { checkBundleInSandbox } from "./sandboxCheck.js";

export type Problem = { where: string; message: string };

export type ValidateOptions = {
  /** Skip the QuickJS bundle check (faster; used in unit tests). */
  skipSandbox?: boolean;
};

const KNOWN_FAMILIES = new Set<PluginFamily>([
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
  "exercise-pack",
]);

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Local-file path for a `manifestUrl` / `bundleUrl`. Both are resolved relative
 * to the registry root — a manifest references its artifact by repo path, not by
 * a path relative to its own directory. Returns null for remote (http) URLs.
 */
function localPath(root: string, url: string): string | null {
  if (/^https?:\/\//i.test(url)) return null;
  return resolve(root, url.replace(/^\//, ""));
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function sha256(text: string): string {
  return "sha256-" + createHash("sha256").update(text, "utf8").digest("base64");
}

/**
 * Validate a whole registry directory: `registry.json` plus every manifest and
 * artifact it points at. Returns a flat problem list — empty means the registry
 * is publishable.
 */
export async function validateRegistry(
  registryDir: string,
  opts: ValidateOptions = {},
): Promise<Problem[]> {
  const problems: Problem[] = [];
  const root = resolve(registryDir);
  const registryPath = join(root, "registry.json");

  let entries: unknown;
  try {
    entries = await readJson(registryPath);
  } catch (e) {
    return [{ where: "registry.json", message: `unreadable / invalid JSON: ${(e as Error).message}` }];
  }
  if (!Array.isArray(entries)) {
    return [{ where: "registry.json", message: "must be a JSON array of entries" }];
  }

  const seenIds = new Set<string>();

  for (const [i, entry] of entries.entries()) {
    const at = `registry.json[${i}]`;
    if (!entry || typeof entry !== "object") {
      problems.push({ where: at, message: "not an object" });
      continue;
    }
    const e = entry as Record<string, unknown>;

    for (const field of ["id", "name", "description", "family", "manifestUrl"] as const) {
      if (field === "description" ? typeof e[field] !== "string" : !isStr(e[field])) {
        problems.push({ where: at, message: `${field}: required` });
      }
    }
    if (isStr(e.family) && !KNOWN_FAMILIES.has(e.family as PluginFamily)) {
      problems.push({ where: at, message: `family: unknown "${e.family}"` });
    }
    if (isStr(e.id)) {
      if (seenIds.has(e.id)) problems.push({ where: at, message: `duplicate id "${e.id}"` });
      seenIds.add(e.id);
    }
    if (!isStr(e.manifestUrl)) continue;

    // ── the manifest ─────────────────────────────────────────────────────────
    const manifestPath = localPath(root, e.manifestUrl);
    if (!manifestPath) {
      problems.push({
        where: at,
        message: `manifestUrl "${e.manifestUrl}" is remote — publish the plugin files into this repo and use a repo-relative path`,
      });
      continue;
    }

    let manifestRaw: unknown;
    try {
      manifestRaw = await readJson(manifestPath);
    } catch (err) {
      problems.push({ where: e.manifestUrl, message: `unreadable: ${(err as Error).message}` });
      continue;
    }

    const check = validateManifest(manifestRaw);
    for (const msg of check.errors) problems.push({ where: e.manifestUrl, message: msg });
    if (!check.valid || !check.manifest) continue;
    const manifest = check.manifest;

    if (isStr(e.id) && manifest.id !== e.id) {
      problems.push({ where: e.manifestUrl, message: `manifest id "${manifest.id}" != registry entry id "${e.id}"` });
    }
    if (isStr(e.family) && manifest.family !== e.family) {
      problems.push({ where: e.manifestUrl, message: `manifest family "${manifest.family}" != registry entry family "${e.family}"` });
    }

    // ── the artifact (bundle or pack data) ───────────────────────────────────
    const dist = manifest.distribution as Record<string, unknown>;
    if (dist.origin === "inline") {
      try {
        parseExercisePack(dist.data, manifest.id);
      } catch (err) {
        problems.push({ where: e.manifestUrl, message: `inline pack invalid: ${(err as Error).message}` });
      }
      continue;
    }

    if (!isStr(dist.bundleUrl)) continue; // already reported by validateManifest
    const artifactPath = localPath(root, dist.bundleUrl);
    if (!artifactPath) {
      problems.push({ where: e.manifestUrl, message: `distribution.bundleUrl "${dist.bundleUrl}" is remote — use a repo-relative path` });
      continue;
    }

    let artifact: string;
    try {
      artifact = await readFile(artifactPath, "utf8");
    } catch (err) {
      problems.push({ where: dist.bundleUrl, message: `unreadable: ${(err as Error).message}` });
      continue;
    }

    // integrity
    if (!manifest.integrity) {
      problems.push({
        where: e.manifestUrl,
        message: `integrity: required for published plugins — add "integrity": "${await computeIntegrity(artifact)}"`,
      });
    } else if (manifest.integrity !== sha256(artifact)) {
      problems.push({
        where: e.manifestUrl,
        message: `integrity mismatch — the artifact hashes to ${sha256(artifact)}`,
      });
    }

    // family-specific artifact validation
    if (manifest.family === "exercise-pack") {
      try {
        const parsed = JSON.parse(artifact);
        parseExercisePack(parsed, manifest.id);
      } catch (err) {
        problems.push({ where: dist.bundleUrl, message: `exercise pack invalid: ${(err as Error).message}` });
      }
    } else if (CODE_FAMILIES.has(manifest.family) && !opts.skipSandbox) {
      const result = await checkBundleInSandbox(artifact, manifest.family, manifest.id);
      for (const msg of result.errors) problems.push({ where: dist.bundleUrl, message: msg });
    }
  }

  return problems;
}
