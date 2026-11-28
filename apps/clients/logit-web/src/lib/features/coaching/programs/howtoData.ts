import { coachApi } from "@logit/core/api/coachApi";
import { howTosForProgram, type CoachHowTo } from "@logit/core/domain/howTo";
import { touchCoachProgram, type CoachProgram } from "@logit/core/domain/CoachProgram";
import { getWebCoachProgramRepo } from "$lib/deps";
import { fetchSource, plugins } from "$lib/features/plugins/pluginData.svelte";
import { parseHowToPack } from "@logit/core/plugins/howtoPack";

/** Your how-tos, then your installed how-to packs' for exercises you haven't written one for
 * (canvas HT5). LogIt's fill the rest on the phone. */
export async function allHowTos(): Promise<CoachHowTo[]> {
  const mine = await coachApi.getHowTos().catch(() => [] as CoachHowTo[]);
  if (!plugins.installsLoaded) await plugins.loadInstalls().catch(() => {});
  const packs = plugins.installed.filter((p) => p.enabled && p.manifest.family === "howto-pack");
  const fromPacks = (await Promise.all(packs.map(async (p) => {
    try { return parseHowToPack(JSON.parse(await fetchSource(p.manifest as never)), p.manifest.id).howtos; } catch { return []; }
  }))).flat();
  const have = new Set(mine.map((h) => h.exerciseName.toLowerCase()));
  const out = [...mine];
  for (const h of fromPacks) if (!have.has(h.exerciseName.toLowerCase())) { out.push(h); have.add(h.exerciseName.toLowerCase()); }
  return out;
}

/** A program with the coach's how-tos for its exercises, ready to give to a client (canvas HT4). */
export function withHowTos(p: CoachProgram, all: CoachHowTo[]): CoachProgram {
  const mine = howTosForProgram(p, all);
  const { howtos: _h, ...rest } = p;
  return mine.length ? { ...rest, howtos: mine } : rest;
}

/** After a how-to changes: every client copy that uses one of those exercises gets the new ones. */
export async function pushHowTosToCopies(all: CoachHowTo[]): Promise<number> {
  const repo = getWebCoachProgramRepo();
  const [rows, clients] = await Promise.all([repo.listMyPrograms(), coachApi.listClients()]);
  const username = new Map(clients.map((c) => [c.client.id, c.client.username]));
  let n = 0;
  for (const r of rows) {
    if (!r.recipientUserId || r.program.archived) continue;
    const next = withHowTos(r.program, all);
    if (JSON.stringify(next.howtos ?? []) === JSON.stringify(r.program.howtos ?? [])) continue;
    const u = username.get(r.recipientUserId);
    if (!u) continue;
    await repo.saveProgram(touchCoachProgram(next), u);
    n++;
  }
  return n;
}
