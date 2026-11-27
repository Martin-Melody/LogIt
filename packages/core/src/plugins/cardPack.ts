import type { WidgetView } from "./widgetView";

/**
 * Card packs (canvas W13, Q1): one plugin with several cards for a coach's Today and Your
 * month. Code, in the sandbox, given only coaching facts the coach already sees: first names,
 * months with you, sessions and program week for clients who share workouts, and check-ins
 * waiting. Never payments, messages or anyone's food, weight or photos.
 */

export type CardPackCard = { id: string; name: string };

export type CardPackClient = {
  firstName: string;
  monthsWithYou: number;
  joinedThisMonth: boolean;
  /** Only when they share workouts. */
  sessions7d: number | null;
  /** Their program from you, when they're on one. */
  program: { name: string; week: number | null; totalWeeks: number; endsInDays: number | null } | null;
  checkinsToReview: number;
};

export type CardPackInput = { card: string; page: "today" | "month"; now: number; clients: CardPackClient[] };

/** The cards a pack says it has, from its meta. */
export function cardPackCards(meta: Record<string, unknown> | null | undefined): CardPackCard[] {
  const raw = Array.isArray(meta?.cards) ? meta.cards : [];
  return raw
    .filter((c): c is { id: string; name: string } => !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" && typeof (c as { name?: unknown }).name === "string")
    .slice(0, 10)
    .map((c) => ({ id: c.id.slice(0, 40), name: c.name.slice(0, 60) }));
}

/** "plugin:<pluginId>:<cardId>" on Today and Your month. */
export const cardPackCardId = (pluginId: string, cardId: string) => `plugin:${pluginId}:${cardId}`;
export function parseCardPackCardId(id: string): { pluginId: string; cardId: string } | null {
  const m = /^plugin:([^:]+):([^:]+)$/.exec(id);
  return m ? { pluginId: m[1]!, cardId: m[2]! } : null;
}

export type CardPackView = WidgetView;
