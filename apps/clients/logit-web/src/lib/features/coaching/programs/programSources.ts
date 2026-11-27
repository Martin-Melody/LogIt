// Where programs come from besides your own (canvas PG1, PG5): LogIt's built-in programs, and
// program packs from the plugin directory (Community).
import { pluginsApi, type HostedRegistryEntry, type ServedManifest } from "@logit/core/api/pluginsApi";
import { BUILTIN_PROGRAMS } from "@logit/core/domain/builtinPrograms";
import { upgradeProgram, type CoachProgram } from "@logit/core/domain/CoachProgram";
import { parseProgramPack } from "@logit/core/plugins/programPack";

export const logitPrograms = (): CoachProgram[] => BUILTIN_PROGRAMS.map(upgradeProgram);

/** Program packs in this server's directory (reviewed, listed). */
export async function communityPacks(): Promise<HostedRegistryEntry[]> {
  return (await pluginsApi.registry()).filter((e) => e.family === "program-pack");
}

/** A pack's programs: its manifest, then its file. */
export async function loadPack(entry: HostedRegistryEntry): Promise<CoachProgram[]> {
  const manifest = (await (await fetch(entry.manifestUrl)).json()) as ServedManifest;
  const raw = await (await fetch(manifest.distribution.bundleUrl)).json();
  return parseProgramPack(raw, entry.id).programs;
}
