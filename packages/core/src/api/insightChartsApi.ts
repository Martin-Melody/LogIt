import { apiClient } from "./client";
import { parseInsightChart, type InsightChart } from "../domain/insightChart";

/**
 * Saved Insights charts on the server. Your own charts sync as rows (/sync/charts, saving
 * is Pro, pulling is open so a coach's chart reaches a Free client). A coach reads and
 * writes a client's charts under /coach/clients/{id}/charts.
 */

export type RemoteInsightChart = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export function chartToRow(chart: InsightChart): RemoteInsightChart {
  return {
    id: chart.id,
    createdAtMs: chart.createdAtMs,
    updatedAtMs: chart.updatedAtMs,
    dataJson: chart.deletedAtMs ? null : JSON.stringify(chart),
    deletedAtMs: chart.deletedAtMs ?? null,
  };
}

/** Live charts from pulled rows, oldest first. Tombstones and junk are dropped. */
export function chartsFromRows(rows: RemoteInsightChart[]): InsightChart[] {
  const out: InsightChart[] = [];
  for (const r of rows) {
    if (r.deletedAtMs) continue;
    const c = parseInsightChart(r.dataJson);
    if (c && !c.deletedAtMs) out.push({ ...c, id: r.id });
  }
  return out.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

type CoachChartDto = { id: string; dataJson: string; updatedAtMs: number };

export const insightChartsApi = {
  pull(since = 0): Promise<{ charts: RemoteInsightChart[] }> {
    return apiClient.fetch(`/sync/charts?since=${since}`);
  },

  push(charts: RemoteInsightChart[]): Promise<void> {
    return apiClient.fetch("/sync/charts", { method: "POST", body: JSON.stringify({ charts }) });
  },

  /** A client's charts as their coach sees them: the ones they show you, and the ones you made. */
  async forClient(clientUserId: string): Promise<{ shown: InsightChart[]; sent: InsightChart[] }> {
    const res: { shown: CoachChartDto[]; sent: CoachChartDto[] } = await apiClient.fetch(`/coach/clients/${clientUserId}/charts`);
    const parse = (rows: CoachChartDto[]) => chartsFromRows(rows.map((r) => ({ id: r.id, createdAtMs: 0, updatedAtMs: r.updatedAtMs, dataJson: r.dataJson })));
    return { shown: parse(res.shown), sent: parse(res.sent) };
  },

  /** Make or update a chart for a client. The server adds "from" (you). */
  async sendToClient(clientUserId: string, chart: InsightChart): Promise<InsightChart> {
    const { from: _from, ...rest } = chart;
    const res: CoachChartDto = await apiClient.fetch(`/coach/clients/${clientUserId}/charts/${encodeURIComponent(chart.id)}`, {
      method: "PUT",
      body: JSON.stringify({ dataJson: JSON.stringify(rest) }),
    });
    return parseInsightChart(res.dataJson) ?? chart;
  },

  removeFromClient(clientUserId: string, chartId: string): Promise<void> {
    return apiClient.fetch(`/coach/clients/${clientUserId}/charts/${encodeURIComponent(chartId)}`, { method: "DELETE" });
  },
};
