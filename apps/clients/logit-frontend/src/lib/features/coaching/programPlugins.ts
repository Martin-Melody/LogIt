import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { coachApi } from "@logit/core/api/coachApi";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";
import { pluginsNeeded, type NeededPlugin } from "@logit/core/domain/programPlan";
import { getBlockDeclaration } from "$lib/plugins/blockPluginStore";
import { listInstalledPluginManifests } from "$lib/plugins/catalog";
import { installPluginFromManifest } from "$lib/plugins/installer";
import { resolvePluginManifest } from "$lib/plugins/discovery";
import { fetchRegistry, type RegistryEntry } from "$lib/plugins/registry";
import { mayRunPlugin } from "$lib/plugins/sandboxedPlugin";
import { setCoachAllowed } from "$lib/plugins/coachAllowed";
import type { PluginManifest } from "$lib/plugins/types";
import weightFinder from "../../../../../../../plugins/first-party/app.getlogit.weight-finder/block.json";

/** LogIt's own data-only blocks, shipped with the app so a Find your weights week works even
 * when the registry doesn't have them (or the phone is offline). */
const BUNDLED_BLOCKS: Record<string, PluginManifest> = {
  [weightFinder.id]: {
    id: weightFinder.id, family: "workout-block", name: weightFinder.name, description: weightFinder.description,
    version: "1.0.0", author: "LogIt", distribution: { origin: "inline", data: weightFinder },
    capabilities: [{ family: "workout-block", blockId: weightFinder.id }],
  } as PluginManifest,
};

/**
 * The plugins a coach's program uses and whether they run on this phone (canvas PG8). One
 * that's missing asks to be allowed; the coach is told what the client chose, and told again
 * if the plugin goes from the phone later.
 */
export type ProgramPlugin = NeededPlugin & { ready: boolean; entry: RegistryEntry | null };

/** LogIt's own blocks (app.getlogit.*, data only, no code) come with the program, like the
 * Weight finder in a Find your weights week: a coach using one means the client gets it too. */
export async function ensureOwnBlocks(program: CoachProgram): Promise<void> {
  const own = pluginsNeeded(program).filter((n) => n.kind === "block" && n.pluginId.startsWith("app.getlogit.") && !getBlockDeclaration(n.pluginId));
  if (!own.length) return;
  const entries = (await fetchRegistry().catch(() => ({ entries: [] as RegistryEntry[] }))).entries;
  for (const n of own) {
    const entry = entries.find((e) => e.id === n.pluginId);
    const manifest = entry ? await resolvePluginManifest({ kind: "url", url: entry.manifestUrl }).catch(() => null) : null;
    if (manifest?.id === n.pluginId && manifest.family === "workout-block") {
      await installPluginFromManifest(manifest, true, { source: "registry" }).catch(() => {});
      continue;
    }
    // Not in any registry (offline, or not published there): the copy that ships with the app.
    const bundled = BUNDLED_BLOCKS[n.pluginId];
    if (bundled) await installPluginFromManifest(bundled, true, { source: "registry" }).catch(() => {});
  }
}

export async function programPlugins(program: CoachProgram): Promise<ProgramPlugin[]> {
  await ensureOwnBlocks(program).catch(() => {});
  const needed = pluginsNeeded(program);
  if (!needed.length) return [];
  const installed = await listInstalledPluginManifests();
  const ready = (n: NeededPlugin) =>
    n.kind === "block"
      ? !!getBlockDeclaration(n.pluginId)
      : installed.some((p) => p.manifest.id === n.pluginId && p.enabled) && mayRunPlugin(n.pluginId);
  const missing = needed.filter((n) => !ready(n));
  const entries = missing.length ? (await fetchRegistry().catch(() => ({ entries: [] as RegistryEntry[] }))).entries : [];
  return needed.map((n) => ({ ...n, ready: ready(n), entry: entries.find((e) => e.id === n.pluginId) ?? null }));
}

/** "Allow for Sam's programs": add it to this phone; code plugins may run for this only. */
export async function allowProgramPlugin(p: ProgramPlugin, relationshipId: string | null): Promise<void> {
  if (!p.entry) throw new Error(`${p.name} isn't in the plugin list any more. Ask your coach about it.`);
  const manifest = await resolvePluginManifest({ kind: "url", url: p.entry.manifestUrl });
  if (manifest.id !== p.pluginId) throw new Error("That plugin's listing doesn't match. Ask your coach about it.");
  await installPluginFromManifest(manifest, true, { source: "registry" });
  if (p.kind === "rule") setCoachAllowed(p.pluginId, true);
  if (relationshipId) await tellCoach(relationshipId, p, "allowed");
}

export async function declineProgramPlugin(p: ProgramPlugin, relationshipId: string | null): Promise<void> {
  if (relationshipId) await tellCoach(relationshipId, p, "declined");
}

// What this phone last told the coach, so it says each change once.
const KEY = "logit:coaching:plugin-consent:v1";
type Told = Record<string, "allowed" | "declined" | "removed">;
function told(): Told {
  try {
    return JSON.parse(getAccountItem(KEY) ?? "{}") as Told;
  } catch {
    return {};
  }
}
export function toldCoach(relationshipId: string, pluginId: string): Told[string] | undefined {
  return told()[`${relationshipId}:${pluginId}`];
}

async function tellCoach(relationshipId: string, p: NeededPlugin, state: Told[string]): Promise<void> {
  const all = told();
  const key = `${relationshipId}:${p.pluginId}`;
  if (all[key] === state) return;
  await coachApi.setPluginConsent(relationshipId, p.pluginId, p.name, state);
  setAccountItem(KEY, JSON.stringify({ ...all, [key]: state }));
}

/** Keeps the coach's view true: an allowed plugin that's gone says "removed"; one that's there says "allowed". */
export async function syncProgramPlugins(plugins: ProgramPlugin[], relationshipId: string | null): Promise<void> {
  if (!relationshipId) return;
  for (const p of plugins) {
    const was = toldCoach(relationshipId, p.pluginId);
    if (p.ready && was !== "allowed") await tellCoach(relationshipId, p, "allowed").catch(() => {});
    else if (!p.ready && was === "allowed") await tellCoach(relationshipId, p, "removed").catch(() => {});
  }
}
