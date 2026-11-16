import {
  coachApi,
  SHARE_ALL,
  type CheckinInboxItem,
  type CoachingRequest,
  type RosterEntry,
  type SentInvite,
  type Sharing,
} from "@logit/core/api/coachApi";
import { messagesApi } from "@logit/core/api/messagesApi";
import {
  getProgramProgress,
  type CoachProgram,
} from "@logit/core/domain/CoachProgram";
import { missedCheckin, type CheckinSchedule, type CheckinSubmission } from "@logit/core/domain/Checkin";
import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
import type { MyCheckinSchedule } from "@logit/core/data/checkinRepo";
import { getWebCheckinRepo, getWebCoachProgramRepo } from "$lib/deps";

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
  /** Ms until the last week ends, while running. */
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
  lastSessionAtMs: number | null;
  unread: number;
  program: ProgramStatus | null;
  /** Submitted check-ins from this client not yet reviewed. */
  toReview: CheckinInboxItem[];
  lastCheckinAtMs: number | null;
  missed: { schedule: CheckinSchedule; dueMs: number } | null;
  scheduleCount: number;
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
    coachApi.listRequests().catch(() => [] as CoachingRequest[]),
    coachApi.listSentInvites().catch(() => [] as SentInvite[]),
  ]);
  const now = Date.now();
  const clients = roster.map((r) => summarise(r, inbox, schedules, programs, now));
  return { clients, inbox, schedules, programs, requests, sent };
}

function summarise(
  r: RosterEntry,
  inbox: CheckinInboxItem[],
  schedules: MyCheckinSchedule[],
  programs: MyCoachProgram[],
  now: number,
): ClientSummary {
  const sharing = r.sharing ?? SHARE_ALL;
  const mine = inbox.filter((i) => i.clientUserId === r.client.id);
  const subs = mine.map(parseSubmission).filter((s): s is CheckinSubmission => s != null);
  const clientSchedules = schedules.filter((s) => s.recipientUserId === r.client.id && !s.schedule.archived);
  let missed: ClientSummary["missed"] = null;
  if (sharing.checkins) {
    for (const s of clientSchedules) {
      const m = missedCheckin(s.schedule, subs, now);
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
    lastSessionAtMs: r.lastSessionAtMs,
    unread: r.unreadFromClient,
    program: currentProgram(
      programs.filter((p) => p.recipientUserId === r.client.id).map((p) => p.program),
      now,
    ),
    toReview: mine.filter((i) => i.reviewedAtMs == null),
    lastCheckinAtMs: r.lastCheckinSubmittedAtMs,
    missed,
    scheduleCount: clientSchedules.length,
  };
}

/** Things waiting for the coach, newest first. */
export type NeedsYou =
  | { kind: "checkin"; at: number; client: ClientSummary; item: CheckinInboxItem }
  | { kind: "message"; at: number; client: ClientSummary }
  | { kind: "missed"; at: number; client: ClientSummary; dueMs: number }
  | { kind: "ending"; at: number; client: ClientSummary; program: ProgramStatus }
  | { kind: "request"; at: number; request: CoachingRequest };

export function needsYou(o: CoachingOverview, now = Date.now()): NeedsYou[] {
  const out: NeedsYou[] = [];
  for (const c of o.clients) {
    for (const item of c.toReview) out.push({ kind: "checkin", at: item.submittedAtMs, client: c, item });
    if (c.unread > 0) out.push({ kind: "message", at: now, client: c });
    if (c.missed) out.push({ kind: "missed", at: c.missed.dueMs, client: c, dueMs: c.missed.dueMs });
    const p = c.program;
    if (p?.state === "running" && p.endsAtMs != null && p.endsAtMs - now <= 7 * DAY) {
      out.push({ kind: "ending", at: p.endsAtMs - 7 * DAY, client: c, program: p });
    }
  }
  for (const r of o.requests) out.push({ kind: "request", at: Date.parse(r.requestedAt), request: r });
  return out.sort((a, b) => b.at - a.at);
}

export async function unreadTotal(): Promise<number> {
  const counts = await messagesApi.unreadCounts();
  return counts.reduce((n, c) => n + c.unread, 0);
}
