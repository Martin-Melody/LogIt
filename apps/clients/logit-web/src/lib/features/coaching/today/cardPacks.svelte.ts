// Card packs on Today and Your month (canvas W13): your installed card pack plugins and the
// cards each one lists, and the roster facts they're given (never payments or messages).
import { cardPackCards, type CardPackCard, type CardPackInput } from "@logit/core/plugins/cardPack";
import { plugins, fetchSource, pluginMeta } from "$lib/features/plugins/pluginData.svelte";
import type { CoachingOverview } from "../coachingData";

const DAY = 86_400_000;

class CardPacks {
  list = $state<{ pluginId: string; name: string; cards: CardPackCard[] }[]>([]);
  private loading: Promise<void> | null = null;
  load(): Promise<void> {
    this.loading ??= (async () => {
      if (!plugins.installsLoaded) await plugins.loadInstalls().catch(() => {});
      const packs = plugins.installed.filter((p) => p.enabled && p.manifest.family === "card-pack");
      this.list = (await Promise.all(packs.map(async (p) => {
        try {
          const meta = await pluginMeta("card-pack", await fetchSource(p.manifest as never));
          return { pluginId: p.manifest.id, name: p.manifest.name, cards: cardPackCards(meta) };
        } catch {
          return null;
        }
      }))).filter((x): x is NonNullable<typeof x> => !!x && x.cards.length > 0);
    })();
    return this.loading;
  }
  nameOf(pluginId: string, cardId: string): string | null {
    const p = this.list.find((x) => x.pluginId === pluginId);
    const c = p?.cards.find((x) => x.id === cardId);
    return p && c ? `${c.name} · ${p.name}` : null;
  }
}
export const cardPacks = new CardPacks();

/** What a card pack is given: only roster facts you already see on Today. */
export function cardPackInput(o: CoachingOverview, card: string, page: "today" | "month", now = Date.now()): CardPackInput {
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  return {
    card, page, now,
    clients: o.clients.map((c) => {
      const since = c.since ? Date.parse(c.since) : NaN;
      const p = c.program;
      return {
        firstName: c.name.split(" ")[0] || c.name,
        monthsWithYou: Number.isFinite(since) ? Math.max(0, Math.floor((now - since) / (30.44 * DAY))) : 0,
        joinedThisMonth: Number.isFinite(since) && since >= monthStart,
        sessions7d: c.sharing.workouts ? c.sessions7d : null,
        plannedPerWeek: c.sharing.workouts && p?.state === "running" ? p.daysPerWeek : null,
        checkinLateDays: c.sharing.checkins ? (c.missed ? Math.max(0, Math.floor((now - c.missed.dueMs) / DAY)) : 0) : null,
        program: p ? { name: p.program.name, week: p.week, totalWeeks: p.totalWeeks, endsInDays: p.endsAtMs ? Math.max(0, Math.ceil((p.endsAtMs - now) / DAY)) : null } : null,
        checkinsToReview: c.toReview.length,
      };
    }),
  };
}
