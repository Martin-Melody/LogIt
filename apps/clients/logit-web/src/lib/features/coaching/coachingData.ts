import { coachAway } from "./away.svelte";
import { coachTrial } from "$lib/workspace";
import { practice } from "$lib/features/guide/sandbox.svelte";
import {
  coachApi,
  awayExcuse,
  SHARE_ALL,
  type CheckinInboxItem,
  type CoachingRequest,
  type RosterEntry,
  type SentInvite,
  type Sharing,
} from "@logit/core/api/coachApi";
import { messagesApi } from "@logit/core/api/messagesApi";
import { handoffDue, type ProgramPhase,
  getProgramProgress,
  type CoachProgram, maxTestDue } from "@logit/core/domain/CoachProgram";
import { missedCheckin, type CheckinSchedule, type CheckinSubmission } from "@logit/core/domain/Checkin";
import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
import type { MyCheckinSchedule } from "@logit/core/data/checkinRepo";
import { getWebCheckinRepo, getWebCoachProgramRepo } from "$lib/deps";
import { offerStateNow } from "@logit/core/domain/coachRequest";

const DAY = 86_400_000;

/** A client's program copy and where they are in it. */
export type ProgramStatus = {
  program: CoachProgram;
  /** "running" week n of total, "scheduled" from a date, "waiting" for Start, "finished". */
  state: "running" | "scheduled" | "waiting" | "finished";
  week: number | null;
  totalWeeks: number;
  startsAtMs: number | null;
  /** Planned sessions a week (days in the current or first week). */
  daysPerWeek: number;
  /** When the last week ends (epoch ms), while running. */
  endsAtMs: number | null;
};

export type ClientSummary = {
  relationshipId: string;
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  /** A sandbox sample client. */
  isSample: boolean;
  sharing: Sharing;
  since: string | null;
  sessions7d: number;
  /** Canvas K3: their answers when they asked to be coached. */
  answers: import("@logit/core/domain/coachRequest").RequestAnswer[];
  /** Canvas W1: days of the last 7 with food logged (null: not shared). */
  foodDays7d: number | null;
  lastSessionAtMs: number | null;
  unread: number;
  program: ProgramStatus | null;
  /** Submitted check-ins from this client not yet reviewed. */
  toReview: CheckinInboxItem[];
  lastCheckinAtMs: number | null;
  missed: { schedule: CheckinSchedule; dueMs: number } | null;
  scheduleCount: number;
  /** Their first message since your last reply (canvas Z2). */
  waitingSinceMs: number | null;
  /** You paused coaching until then (canvas E1). */
  pausedUntil: string | null;
  /** Coaching ends then (they stopped, or moved coach). */
  endsAt: string | null;
  /** Canvas Q8: an unread "for the rest of the program" swap. */
  lastingSwap: boolean;
  /** Canvas PG8: what they said about each plugin your programs use. */
  pluginConsent: import("@logit/core/api/coachApi").PluginConsent;
};

export type CoachingOverview = {
  clients: ClientSummary[];
  inbox: CheckinInboxItem[];
  schedules: MyCheckinSchedule[];
  programs: MyCoachProgram[];
  requests: CoachingRequest[];
  sent: SentInvite[];
};

export function programStatus(program: CoachProgram, now = Date.now()): ProgramStatus {
  const p = getProgramProgress(program, now);
  const totalWeeks = program.weeks.length;
  const weekDays = (n: number) => program.weeks.find((w) => w.weekNumber === n)?.days.length ?? 0;
  const base = { program, totalWeeks, startsAtMs: null, endsAtMs: null };
  switch (p.status) {
    case "running": {
      const start = program.startMode === "fixed-date" ? program.startDateMs! : program.clientStartedAtMs!;
      return { ...base, state: "running", week: p.weekNumber, daysPerWeek: weekDays(p.weekNumber), endsAtMs: start + totalWeeks * 7 * DAY };
    }
    case "scheduled":
      return { ...base, state: "scheduled", week: null, daysPerWeek: weekDays(1), startsAtMs: p.startsAtMs };
    case "not-started":
      return { ...base, state: "waiting", week: null, daysPerWeek: weekDays(1) };
    default:
      return { ...base, state: "finished", week: null, daysPerWeek: 0 };
  }
}

/** The program a client is on now: running first, then the next one scheduled, then one
 * waiting for Start. Archived (ended) and finished ones don't count. */
/** When a program from you ends (or ended): its start plus its weeks; null before it starts. */
export function programEndMs(program: CoachProgram): number | null {
  const start = program.startMode === "fixed-date" ? program.startDateMs : program.clientStartedAtMs;
  return start ? start + program.weeks.length * 7 * DAY : null;
}

export function currentProgram(programs: CoachProgram[], now = Date.now()): ProgramStatus | null {
  const order = { running: 0, scheduled: 1, waiting: 2, finished: 3 } as const;
  const live = programs
    .filter((p) => !p.archived)
    .map((p) => programStatus(p, now))
    .filter((s) => s.state !== "finished")
    .sort((a, b) => order[a.state] - order[b.state] || b.program.updatedAtMs - a.program.updatedAtMs);
  return live[0] ?? null;
}

export function parseSubmission(item: CheckinInboxItem): CheckinSubmission | null {
  try {
    return JSON.parse(item.dataJson) as CheckinSubmission;
  } catch {
    return null;
  }
}

/** Everything the Today, Clients and Check-ins pages need, in one go. */
export async function loadCoachingOverview(): Promise<CoachingOverview> {
  const [roster, inbox, schedules, programs, requests, sent] = await Promise.all([
    coachApi.getRoster(),
    coachApi.checkinInbox().catch(() => [] as CheckinInboxItem[]),
    getWebCheckinRepo().listMySchedules(),
    getWebCoachProgramRepo().listMyPrograms(),
    // Requests come through invite links, which are Studio-only: none while trying samples.
    coachTrial() ? Promise.resolve([] as CoachingRequest[]) : coachApi.listRequests().catch(() => [] as CoachingRequest[]),
    coachApi.listSentInvites().catch(() => [] as SentInvite[]),
    coachAway.load(),
  ]);
  const now = Date.now();
  // Canvas Z7: check-ins due while you were away aren't missed.
  const excuse = awayExcuse(coachAway.value);
  // Practice view: the samples, or everyone else (never both). Programs and schedules
  // nobody was given (templates) belong to both.
  const shown = roster.filter((r) => practice.shows(r.client.isSample));
  const ids = new Set(shown.map((r) => r.client.id));
  const mine = <T extends { recipientUserId?: string | null }>(x: T) => !x.recipientUserId || ids.has(x.recipientUserId);
  const clients = shown.map((r) => summarise(r, inbox, schedules, programs, now, excuse));
  return {
    clients,
    inbox: inbox.filter((i) => ids.has(i.clientUserId)),
    schedules: schedules.filter(mine),
    programs: programs.filter(mine),
    requests: requests.filter((r) => practice.shows(r.client.isSample)),
    sent: practice.on ? [] : sent,
  };
}

/** A list of the coach's clients (coachApi.listClients) as Practice view shows it. */
export function inView<T extends { client: { isSample?: boolean } }>(list: T[]): T[] {
  return list.filter((r) => practice.shows(r.client.isSample));
}

function summarise(
  r: RosterEntry,
  inbox: CheckinInboxItem[],
  schedules: MyCheckinSchedule[],
  programs: MyCoachProgram[],
  now: number,
  excuse: ReturnType<typeof awayExcuse> = null,
): ClientSummary {
  const sharing = r.sharing ?? SHARE_ALL;
  const mine = inbox.filter((i) => i.clientUserId === r.client.id);
  const subs = mine.map(parseSubmission).filter((s): s is CheckinSubmission => s != null);
  const clientSchedules = schedules.filter((s) => s.recipientUserId === r.client.id && !s.schedule.archived);
  let missed: ClientSummary["missed"] = null;
  // Paused by you: check-ins due meanwhile aren't missed.
  const paused = !!r.pausedUntil && Date.parse(r.pausedUntil) > now;
  if (sharing.checkins && !paused) {
    for (const s of clientSchedules) {
      const m = missedCheckin(s.schedule, subs, now, excuse);
      if (m && (!missed || m.dueMs > missed.dueMs)) missed = { schedule: s.schedule, dueMs: m.dueMs };
    }
  }
  return {
    relationshipId: r.relationshipId,
    id: r.client.id,
    username: r.client.username,
    name: r.client.displayName || r.client.username,
    avatarUrl: r.client.avatarUrl,
    isSample: !!r.client.isSample,
    sharing,
    since: r.since ?? null,
    sessions7d: r.sessions7d,
    foodDays7d: r.foodDays7d ?? null,
    answers: r.answers ?? [],
    lastSessionAtMs: r.lastSessionAtMs,
    unread: r.unreadFromClient,
    lastingSwap: !!r.lastingSwap,
    pluginConsent: r.pluginConsent ?? {},
    program: currentProgram(
      programs.filter((p) => p.recipientUserId === r.client.id).map((p) => p.program),
      now,
    ),
    toReview: mine.filter((i) => i.reviewedAtMs == null),
    lastCheckinAtMs: r.lastCheckinSubmittedAtMs,
    missed,
    scheduleCount: clientSchedules.length,
    waitingSinceMs: r.waitingSinceMs ?? null,
    pausedUntil: r.pausedUntil ?? null,
    endsAt: r.endsAt ?? null,
  };
}

/** Things waiting for the coach, newest first. */
export type NeedsYou =
  | { kind: "checkin"; at: number; client: ClientSummary; item: CheckinInboxItem }
  | { kind: "message"; at: number; client: ClientSummary }
  | { kind: "missed"; at: number; client: ClientSummary; dueMs: number }
  | { kind: "ending"; at: number; client: ClientSummary; program: ProgramStatus }
  | { kind: "request"; at: number; request: CoachingRequest }
  // Canvas Z2: a client has waited 5+ days for a reply (at 7 they can stop with a refund).
  | { kind: "waiting"; at: number; client: ClientSummary; days: number }
  // Canvas Q8: a client changed an exercise for the rest of the program.
  | { kind: "lasting-swap"; at: number; client: ClientSummary }
  // Canvas SP4: a phase that finds weights is done; check the numbers the next phase starts from.
  | { kind: "weights-found"; at: number; client: ClientSummary; program: ProgramStatus; phase: ProgramPhase }
  // Canvas PX4: a max test is done; how far they've come.
  | { kind: "maxes-found"; at: number; client: ClientSummary; program: ProgramStatus; phase: ProgramPhase };

export function needsYou(o: CoachingOverview, now = Date.now()): NeedsYou[] {
  const out: NeedsYou[] = [];
  for (const c of o.clients) {
    for (const item of c.toReview) out.push({ kind: "checkin", at: item.submittedAtMs, client: c, item });
    const waitedDays = c.waitingSinceMs ? Math.floor((now - c.waitingSinceMs) / DAY) : 0;
    if (waitedDays >= 5) out.push({ kind: "waiting", at: c.waitingSinceMs!, client: c, days: waitedDays });
    else if (c.lastingSwap) out.push({ kind: "lasting-swap", at: now, client: c });
    else if (c.unread > 0) out.push({ kind: "message", at: now, client: c });
    if (c.missed) out.push({ kind: "missed", at: c.missed.dueMs, client: c, dueMs: c.missed.dueMs });
    const p = c.program;
    const found = p?.state === "running" && p.week != null ? handoffDue(p.program, p.week) : null;
    if (found) out.push({ kind: "weights-found", at: now, client: c, program: p!, phase: found });
    const maxed = p?.state === "running" && p.week != null ? maxTestDue(p.program, p.week) : null;
    if (maxed) out.push({ kind: "maxes-found", at: now, client: c, program: p!, phase: maxed });
    if (p?.state === "running" && p.endsAtMs != null && p.endsAtMs - now <= 7 * DAY) {
      out.push({ kind: "ending", at: p.endsAtMs - 7 * DAY, client: c, program: p });
    }
  }
  // A request needs you while it's unanswered or its offer ran out; not while an offer is out or
  // they're on the waiting list (canvas C1, C4).
  for (const r of o.requests) {
    const stage = r.stage ?? "asked";
    const ranOut = stage === "offered" && r.offer && offerStateNow(r.offer, now) === "expired";
    if (stage === "asked" || ranOut) out.push({ kind: "request", at: Date.parse(r.requestedAt), request: r });
  }
  return out.sort((a, b) => b.at - a.at);
}

export async function unreadTotal(): Promise<number> {
  const counts = await messagesApi.unreadCounts();
  return counts.reduce((n, c) => n + c.unread, 0);
}
