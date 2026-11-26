import { apiClient } from "./client";
import type { GroupPerson } from "./groupsApi";

// Boards (friends overhaul, design canvas G4, G1, B1–B2, P1; journey F6): effort, never weight.
// The phone sends this week's numbers; see services/api BoardEndpoints.

export interface BoardWeek {
  /** The week's Monday, "YYYY-MM-DD". */
  week: string;
  done: number;
  planned: number;
  weeksKept: number;
  /** Volume per workout against your usual, in percent; null with no usual yet. */
  volumePct: number | null;
  /** The whole week is paused. */
  rest: boolean;
}

export interface BoardRow {
  user: GroupPerson;
  done: number;
  planned: number;
  weeksKept: number;
  volumePct: number | null;
  rest: boolean;
  me: boolean;
}

export interface Board {
  week: string;
  /** In board order. */
  rows: BoardRow[];
  /** You see it but aren't on it (your setting). */
  meHidden: boolean;
}

export const boardsApi = {
  send: (w: BoardWeek) => apiClient.fetch<void>("/boards/me", { method: "PUT", body: JSON.stringify(w) }),
  friends: (week: string) => apiClient.fetch<Board>(`/boards/friends?week=${week}`),
  group: (groupId: string, week: string) => apiClient.fetch<Board>(`/groups/${groupId}/board?week=${week}`),
};

/** Place numbers down the board: a rest week gets none ("–") and doesn't take one. */
export function boardPlaces(rows: BoardRow[]): (number | null)[] {
  let n = 0;
  return rows.map((r) => (r.rest ? null : ++n));
}

/** This week's plan all done (shown green). */
export const allDone = (r: Pick<BoardRow, "done" | "planned" | "rest">) => !r.rest && r.planned > 0 && r.done >= r.planned;

/** "+6%", "−4%", "" for no usual yet. */
export const volumeText = (pct: number | null) => (pct == null ? "" : pct > 0 ? `+${pct}%` : pct < 0 ? `−${-pct}%` : "0%");
