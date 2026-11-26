// Which training cards a profile shows (design canvas row 21): the ones its owner switched on
// that have something in them, in their order. Shared by the app, the web app and getlogit.app.
import type { PublicProfileData } from "../api/socialApi";

export type CardKind = "body" | "split" | "prs" | "photo" | "weight" | "streak" | "badges";

/** The phone's widget ids (localProfileWidgetRegistry) to card kinds. */
export const CARD_BY_ID: Record<string, CardKind> = {
  "profile-body-stats": "body",
  "profile-active-split": "split",
  "profile-personal-records": "prs",
  "profile-progress-photo": "photo",
  "profile-weight-trend": "weight",
  "profile-streak": "streak",
  "profile-milestones": "badges",
};

/** Whether the snapshot has anything to show on this card (an empty card is left out). */
export function cardHasData(d: PublicProfileData, kind: CardKind): boolean {
  switch (kind) {
    case "body": return !!d.bodyStats && (d.bodyStats.height != null || d.bodyStats.weight != null);
    case "split": return !!d.activeSplit;
    case "prs": return !!d.personalRecords?.length;
    case "photo": return !!d.progressPhoto?.dataUrl;
    case "weight": return (d.weightTrend?.points.length ?? 0) > 1;
    case "streak": return !!d.streak;
    case "badges": return !!d.badges?.length;
  }
}

export function parseProfileData(json: string | null | undefined): PublicProfileData | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as PublicProfileData;
    return Array.isArray(d?.widgets) ? d : null;
  } catch {
    return null;
  }
}

/** The snapshot's widgets that are cards we know, in their order. */
export function orderedWidgets(d: PublicProfileData) {
  return [...d.widgets].filter((w) => CARD_BY_ID[w.id]).sort((a, b) => a.order - b.order);
}

/** The cards switched on that have something to show, in their order. */
export function shownCards(d: PublicProfileData | null): CardKind[] {
  return d ? orderedWidgets(d).filter((w) => w.enabled && cardHasData(d, CARD_BY_ID[w.id]!)).map((w) => CARD_BY_ID[w.id]!) : [];
}
