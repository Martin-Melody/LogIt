// A month sent to a client (canvas W4 "Send to client", W7 the card in the conversation, W12
// the note in their Progress): the coach's note on top, then the Training, Body and Food numbers
// from the Overview's cards. Built from the client's own data, so it holds nothing they haven't
// got; photos never go in the card.

import type { WidgetView, WidgetStatGridNode } from "../plugins/widgetView";

export type MonthReport = {
  v: 1;
  /** "YYYY-MM" */
  month: string;
  /** "November" */
  label: string;
  note: string;
  sections: { title: string; stats: { label: string; value: string; sublabel?: string }[] }[];
};

export const MAX_NOTE = 1000;

/** The report from the Overview's Training, Body and Food cards for the month. */
export function monthReportFrom(month: string, label: string, note: string, views: WidgetView[]): MonthReport {
  const sections = views
    .map((v) => ({
      title: v.title,
      stats: v.body
        .filter((n): n is WidgetStatGridNode => n.kind === "stat-grid")
        .flatMap((n) => n.stats)
        .filter((s) => !/photo/i.test(s.label))
        .slice(0, 4)
        .map((s) => ({ label: s.label, value: s.value, ...(s.sublabel ? { sublabel: s.sublabel.slice(0, 80) } : {}) })),
    }))
    .filter((s) => s.stats.length > 0);
  return { v: 1, month, label, note: note.trim().slice(0, MAX_NOTE), sections };
}

export function parseMonthReport(json: string | null | undefined): MonthReport | null {
  try {
    const r = json ? (JSON.parse(json) as Partial<MonthReport>) : null;
    if (!r || r.v !== 1 || typeof r.month !== "string" || !/^\d{4}-\d{2}$/.test(r.month) || typeof r.label !== "string" || !Array.isArray(r.sections)) return null;
    return { v: 1, month: r.month, label: r.label, note: typeof r.note === "string" ? r.note : "", sections: r.sections.filter((s) => s && typeof s.title === "string" && Array.isArray(s.stats)) };
  } catch {
    return null;
  }
}

/** The message text under the card (and for apps that don't draw it yet). */
export function monthReportBody(r: MonthReport): string {
  return r.note ? `Your ${r.label}: ${r.note}` : `Your ${r.label}`;
}
