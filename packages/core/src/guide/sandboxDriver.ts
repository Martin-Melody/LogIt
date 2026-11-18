// Runs the coach sandbox's sample clients against the API. The coach's app (web or phone)
// calls runSampleClients() every few seconds while the sandbox exists; each sample is signed
// in with a short-lived token and uses the normal client calls. What they do is decided by
// planSampleActions() in sandbox.ts.

import { apiClient, withToken } from "../api/client";
import { coachApi, coachApiFor } from "../api/coachApi";
import { checkinApiFor } from "../api/checkinApi";
import { coachProgramApiFor } from "../api/coachProgramApi";
import { messagesApiFor } from "../api/messagesApi";
import { sandboxApi, type SandboxClient } from "../api/sandboxApi";
import { syncApiFor } from "../api/syncApi";
import { checkinSubmissionDto, nutritionRowDto, sessionDto } from "../api/syncDtos";
import type { CheckinSchedule, CheckinSubmission } from "../domain/Checkin";
import type { CoachProgram } from "../domain/CoachProgram";
import { createId } from "../domain/ids";
import type { WorkoutSession } from "../domain/workout";
import { SAMPLE_CLIENTS, planSampleActions, sampleHistory, sampleSpec, type SampleKey, type SampleAction } from "./sandbox";

const TOKEN_TTL_MS = 10 * 60_000;
const tokens = new Map<string, { token: string; at: number }>();

async function as(userId: string) {
  const cached = tokens.get(userId);
  let token = cached && Date.now() - cached.at < TOKEN_TTL_MS ? cached.token : null;
  if (!token) {
    token = await sandboxApi.token(userId);
    tokens.set(userId, { token, at: Date.now() });
  }
  const f = withToken(token);
  return {
    sync: syncApiFor(f), coach: coachApiFor(f), programs: coachProgramApiFor(f),
    checkins: checkinApiFor(f), messages: messagesApiFor(f),
  };
}

const parse = <T>(rows: { dataJson: string | null; deletedAtMs?: number | null }[]): T[] =>
  rows.filter((r) => r.dataJson && !r.deletedAtMs).map((r) => JSON.parse(r.dataJson!) as T);

/** Adds Niamh, Conor and Dara, and gives the coached ones their four weeks of history. */
export async function addSampleClients(now = Date.now()): Promise<SandboxClient[]> {
  const created = await sandboxApi.create(
    SAMPLE_CLIENTS.map((s) => ({ key: s.key, displayName: s.displayName, active: s.active, sharing: s.sharing })),
  );
  for (const c of created) {
    const history = sampleHistory(c.key as SampleKey, now);
    if (!history.sessions.length && !history.days.length && !history.weights.length) continue;
    const api = await as(c.userId);
    if (history.sessions.length) await api.sync.pushSessions(history.sessions.map(sessionDto));
    if (history.days.length) await api.sync.pushNutritionDays(history.days.map((d) => nutritionRowDto(d.id, d)));
    if (history.weights.length) await api.sync.pushWeightEntries(history.weights.map((w) => nutritionRowDto(w.id, w)));
  }
  return created;
}

export async function removeSampleClients(): Promise<number> {
  tokens.clear();
  return sandboxApi.remove();
}

/** Remove and add again: back to the starting history. */
export async function resetSampleClients(now = Date.now()): Promise<SandboxClient[]> {
  await removeSampleClients();
  return addSampleClients(now);
}

let running: Promise<number> | null = null;

/** One round: every sample client looks at its state and acts. Returns how many things they did. */
export function runSampleClients(now = Date.now()): Promise<number> {
  // Never two rounds at once, or a sample could answer the same message twice.
  running ??= runOnce(now).finally(() => { running = null; });
  return running;
}

async function runOnce(now: number): Promise<number> {
  const clients = await sandboxApi.list();
  if (clients.length === 0) return 0;
  const needLinks = clients.some((c) => c.status === "None");
  // Below Studio there are no invite links (403), so a waiting sample just keeps waiting.
  const canLink = apiClient.getUser()?.tier === "Studio" || apiClient.isSelfHosted();
  const activeLinkCodes = needLinks && canLink
    ? (await coachApi.listLinks().catch(() => [])).filter((l) => l.state === "active").map((l) => l.code)
    : [];

  let acted = 0;
  for (const c of clients) {
    const spec = sampleSpec(c.key);
    if (!spec) continue;
    const api = await as(c.userId);
    let state = {
      key: spec.key, status: c.status, activeLinkCodes,
      programs: [] as (CoachProgram & { startedAtMs?: number | null })[],
      sessions: [] as WorkoutSession[], schedules: [] as CheckinSchedule[], submissions: [] as CheckinSubmission[],
      thread: [] as Awaited<ReturnType<typeof api.messages.list>>, coachId: "",
    };
    let relationshipId: string | null = null;
    if (c.status === "Active") {
      const [programs, sessions, schedules, submissions, coaches] = await Promise.all([
        api.programs.pullAssigned(0),
        api.sync.pullSessions(0),
        api.checkins.pullAssigned(0),
        api.sync.pullCheckinSubmissions(0),
        api.coach.listCoaches(),
      ]);
      const coach = coaches[0];
      relationshipId = coach?.relationshipId ?? null;
      state = {
        ...state,
        coachId: coach?.coach.id ?? "",
        programs: programs.filter((p) => p.dataJson && !p.deletedAtMs)
          .map((p) => ({ ...(JSON.parse(p.dataJson!) as CoachProgram), startedAtMs: p.startedAtMs })),
        sessions: parse<WorkoutSession>(sessions.sessions),
        schedules: parse<CheckinSchedule>(schedules),
        submissions: parse<CheckinSubmission>(submissions.submissions),
        thread: relationshipId
          ? (await api.messages.list(relationshipId)).sort((a, b) => a.createdAtMs - b.createdAtMs)
          : [],
      };
    }
    for (const action of planSampleActions(state, now)) {
      await perform(api, action, spec.sharing, relationshipId, now);
      acted++;
    }
  }
  return acted;
}

async function perform(
  api: Awaited<ReturnType<typeof as>>, action: SampleAction,
  sharing: Parameters<typeof api.coach.requestCoaching>[1], relationshipId: string | null, now: number,
) {
  switch (action.kind) {
    case "request": await api.coach.requestCoaching(action.code, sharing); break;
    case "start": await api.programs.startAssigned(action.programId, action.startedAtMs); break;
    case "log": await api.sync.pushSessions([sessionDto(action.session)]); break;
    case "submit": await api.sync.pushCheckinSubmissions([checkinSubmissionDto(action.submission)]); break;
    case "reply":
      if (relationshipId) await api.messages.send({ relationshipId, messageId: createId("msg"), body: action.body, createdAtMs: now });
      break;
  }
}
