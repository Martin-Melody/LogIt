import { apiClient } from "./client";
import type { GroupPerson } from "./groupsApi";

// A group's events (friends overhaul, design canvas G2, E1–E4, the Home meetup card): see
// services/api EventEndpoints. Times are instants (ms); the app shows them in local time.

export const EVENT_KINDS = ["Session", "Meet", "Race", "Social"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** The server's list (EventEndpoints.Sports); the first few are offered first. */
export const EVENT_SPORTS = ["Strength", "Powerlifting", "Running", "CrossFit", "BJJ", "Weightlifting", "Bodybuilding", "Cycling", "Swimming", "Hyrox", "Boxing", "Yoga", "Other"] as const;
export type EventSport = (typeof EVENT_SPORTS)[number];

export interface GroupEvent {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  kind: EventKind;
  startsAtMs: number;
  endsAtMs: number | null;
  place: string | null;
  details: string | null;
  cancelled: boolean;
  /** How many are going. */
  going: number;
  /** Yours: true Going, false Can't make it, null not answered. */
  answer: boolean | null;
  /** On your Home meetup card. */
  pinned: boolean;
  /** A few of those going (you first). */
  goingPeople: GroupPerson[];
  /** You organise the group. */
  canEdit: boolean;
  sport: EventSport | null;
  /** How a repeating event repeats ("Every Tue and Thu"); null for a one-off. */
  repeats: string | null;
  /** You're in its group (else it came from search: groupAccess and requested say how to get in). */
  member: boolean;
  groupAccess: "InviteOnly" | "Request" | "Open";
  groupPlace: string | null;
  groupMembers: number;
  /** You asked to join its group. */
  requested: boolean;
}

/** Which dates an edit or cancel covers on a repeating event. */
export type EventScope = "one" | "following";

export interface EventInput {
  title: string;
  kind: EventKind;
  startsAt: string;
  endsAt?: string | null;
  place?: string | null;
  details?: string | null;
  notify?: boolean;
  sport?: EventSport | null;
  /** A repeating event: every date (worked out with domain/eventRepeat), and its label. */
  dates?: { startsAt: string; endsAt: string | null }[];
  repeats?: string | null;
}

const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const eventsApi = {
  list: (groupId: string, past = false) => apiClient.fetch<GroupEvent[]>(`/groups/${groupId}/events${past ? "?past=true" : ""}`),
  create: (groupId: string, e: EventInput) => apiClient.fetch<GroupEvent>(`/groups/${groupId}/events`, json("POST", e)),
  get: (id: string) => apiClient.fetch<GroupEvent>(`/events/${id}`),
  edit: (id: string, e: Partial<EventInput> & { clearEnd?: boolean; clearSport?: boolean; scope?: EventScope }) =>
    apiClient.fetch<GroupEvent>(`/events/${id}`, json("PATCH", e)),
  cancel: (id: string, scope: EventScope = "one") => apiClient.fetch<void>(`/events/${id}/cancel`, json("POST", { scope })),
  /** Social › Search › Events: upcoming events in findable groups. */
  search: (f: { q?: string; sport?: EventSport | null; kind?: EventKind | null; from?: Date | null; to?: Date | null }) => {
    const p = new URLSearchParams();
    if (f.q?.trim()) p.set("q", f.q.trim());
    if (f.sport) p.set("sport", f.sport);
    if (f.kind) p.set("kind", f.kind);
    if (f.from) p.set("from", f.from.toISOString());
    if (f.to) p.set("to", f.to.toISOString());
    return apiClient.fetch<GroupEvent[]>(`/events/search?${p}`);
  },
  answer: (id: string, going: boolean | null) => apiClient.fetch<GroupEvent>(`/events/${id}/rsvp`, json("PUT", { going })),
  pin: (id: string, pinned: boolean) => apiClient.fetch<void>(`/events/${id}/pin`, json("PUT", { pinned })),
  people: (id: string) => apiClient.fetch<{ going: GroupPerson[]; cantMakeIt: GroupPerson[] }>(`/events/${id}/people`),
  /** The Home meetup card: your pinned event, or the next you're going to; null when there's none. */
  home: async () => (await apiClient.fetch<GroupEvent | undefined>("/events/home")) ?? null,
};

/** "Riya, Dev and 4 others going" (you count as "You"). */
export function goingLine(e: Pick<GroupEvent, "going" | "goingPeople">, me: string): string {
  if (e.going === 0) return "Nobody's said they're going yet";
  const names = e.goingPeople.map((p) => (p.username === me ? "You" : p.displayName || p.username)).slice(0, 2);
  const rest = e.going - names.length;
  if (rest <= 0) return `${names.join(" and ")} ${names.length === 1 && names[0] !== "You" ? "is" : "are"} going`;
  return `${names.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"} going`;
}
