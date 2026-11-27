// The coach's phone (canvas W6): what needs you, grouped by what you'll do. Replying and a quick
// look at a check-in happen here; building programs, meal plans, forms and payments stay on
// the web, and the phone says so.

import { coachApi, isRealClient, type CheckinInboxItem, type CoachingRequest, type RosterEntry } from "@logit/core/api/coachApi";
import { getProgramProgress, getProgramStartMs, type CoachProgram } from "@logit/core/domain/CoachProgram";
import { questionsFor, type CheckinSchedule, type CheckinSubmission } from "@logit/core/domain/Checkin";
import { answerText } from "@logit/core/domain/coachCards";
import { offerStateNow } from "@logit/core/domain/coachRequest";
import { getMessagesRepo } from "$lib/data/repoProvider";
import { createRemoteCheckinRepo } from "@logit/core/data/remote/remoteCheckinRepo";
import { createRemoteCoachProgramRepo } from "@logit/core/data/remote/remoteCoachProgramRepo";

const DAY = 86_400_000;

export type ReplyRow = { relationshipId: string; clientId: string; name: string; line: string };
export type CheckinRow = { item: CheckinInboxItem; submission: CheckinSubmission; previous: CheckinSubmission | null; schedule: CheckinSchedule | null; name: string; line: string; roster: RosterEntry };
export type DecideRow = { key: string; name: string; line: string; href: string; web?: boolean };
export type CoachToday = { reply: ReplyRow[]; checkins: CheckinRow[]; decide: DecideRow[]; roster: RosterEntry[]; programs: { clientId: string; program: CoachProgram }[] };

const nameOf = (u: { displayName?: string | null; username: string }) => u.displayName || u.username;
const first = (n: string) => n.split(" ")[0] || n;
const parse = (i: CheckinInboxItem): CheckinSubmission | null => { try { return JSON.parse(i.dataJson) as CheckinSubmission; } catch { return null; } };

/** "Energy 7 · 70.9 kg": the first scale answer and the weight. */
export function checkinGlance(s: CheckinSubmission, schedule: CheckinSchedule | null): string {
  const qs = questionsFor(s, schedule);
  const get = (id: string) => s.answers.find((a) => a.questionId === id);
  const scale = qs.find((q) => q.type === "scale");
  const weight = qs.find((q) => q.type === "weight");
  return [scale ? `${scale.prompt.replace(/\s*\(.*\)$/, "")} ${get(scale.id)?.number ?? "–"}` : "", weight && get(weight.id)?.number != null ? answerText(weight, get(weight.id)) : ""].filter(Boolean).join(" · ") || "Sent";
}

export async function loadCoachToday(webUrl: string, now = Date.now()): Promise<CoachToday> {
  const [roster, inbox, requests, programs, schedules] = await Promise.all([
    coachApi.getRoster().then((xs) => xs.filter(isRealClient)),
    coachApi.checkinInbox().catch(() => [] as CheckinInboxItem[]),
    coachApi.listRequests().then((xs) => xs.filter(isRealClient)).catch(() => [] as CoachingRequest[]),
    // From the server: programs made on the web aren't kept on the phone.
    createRemoteCoachProgramRepo().listMyPrograms().catch(() => []),
    createRemoteCheckinRepo().listMySchedules().catch(() => []),
  ]);
  const byRel = new Map(roster.map((r) => [r.relationshipId, r]));

  const reply: ReplyRow[] = [];
  for (const r of roster) {
    const waited = r.waitingSinceMs ? Math.floor((now - r.waitingSinceMs) / DAY) : 0;
    if (!r.unreadFromClient && !r.lastingSwap && waited < 5) continue;
    const thread = await getMessagesRepo().listThread(r.relationshipId).catch(() => []);
    const last = thread.filter((m) => !m.mine).at(-1);
    const preview = last ? (last.body ? `"${last.body.length > 48 ? `${last.body.slice(0, 47)}…` : last.body}"` : last.photo ? "Photo" : last.voice ? "Voice message" : "") : "";
    const line = r.lastingSwap ? "Changed an exercise for the rest of the program" : waited >= 5 ? `Waited ${waited} days for a reply` : preview || `${r.unreadFromClient} unread`;
    reply.push({ relationshipId: r.relationshipId, clientId: r.client.id, name: nameOf(r.client), line });
  }

  const checkins: CheckinRow[] = inbox
    .filter((i) => i.reviewedAtMs == null && byRel.has(i.relationshipId))
    .sort((a, b) => a.submittedAtMs - b.submittedAtMs)
    .flatMap((i) => {
      const submission = parse(i);
      if (!submission) return [];
      const schedule = schedules.find((s) => s.schedule.id === i.scheduleId)?.schedule ?? null;
      const before = inbox.filter((x) => x.clientUserId === i.clientUserId && x.scheduleId === i.scheduleId && x.submittedAtMs < i.submittedAtMs).sort((a, b) => b.submittedAtMs - a.submittedAtMs)[0];
      const roster = byRel.get(i.relationshipId)!;
      return [{ item: i, submission, previous: before ? parse(before) : null, schedule, name: first(nameOf(roster.client)), line: checkinGlance(submission, schedule), roster }];
    });

  const decide: DecideRow[] = [];
  for (const q of requests) {
    const stage = q.stage ?? "asked";
    const ranOut = stage === "offered" && q.offer && offerStateNow(q.offer, now) === "expired";
    if (stage !== "asked" && !ranOut) continue;
    const who = nameOf(q.client);
    decide.push({ key: `r:${q.relationshipId}`, name: who, line: ranOut ? `${first(who)}'s offer ran out` : `${first(who)} asked to be coached`, href: `/messages/request/${q.relationshipId}?name=${encodeURIComponent(who)}` });
  }
  const live = programs.filter((p) => p.recipientUserId && !p.program.archived);
  for (const p of live) {
    const r = roster.find((x) => x.client.id === p.recipientUserId);
    const start = getProgramStartMs(p.program);
    if (!r || !start || getProgramProgress(p.program, now).status !== "running") continue;
    const end = start + p.program.weeks.length * 7 * DAY;
    if (end - now > 7 * DAY) continue;
    decide.push({ key: `p:${p.program.id}`, name: nameOf(r.client), line: `${first(nameOf(r.client))}'s program ends ${new Date(end).toLocaleDateString(undefined, { weekday: "short" })}`, href: `${webUrl}/clients/${r.client.id}/next-block`, web: true });
  }
  return { reply, checkins, decide, roster, programs: live.map((p) => ({ clientId: p.recipientUserId!, program: p.program })) };
}

/** "Upper/Lower, week 2 of 8 · 1 of 4 sessions this week" for a client's conversation header. */
export function clientLine(roster: RosterEntry, program: CoachProgram | null, now = Date.now()): string {
  const p = program ? getProgramProgress(program, now) : null;
  const days = p?.status === "running" ? (program!.weeks.find((w) => w.weekNumber === p.weekNumber)?.days.length ?? 0) : 0;
  const parts = [p?.status === "running" ? `${program!.name}, week ${p.weekNumber} of ${program!.weeks.length}` : "", roster.sharing?.workouts === false ? "" : `${roster.sessions7d}${days ? ` of ${days}` : ""} session${roster.sessions7d === 1 && !days ? "" : "s"} this week`];
  return parts.filter(Boolean).join(" · ");
}
