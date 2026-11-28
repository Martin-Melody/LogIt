import { coachApi } from "@logit/core/api/coachApi";
import { answerText } from "@logit/core/domain/coachCards";
import type { CheckinSubmission } from "@logit/core/domain/Checkin";
import { getWebCheckinRepo } from "$lib/deps";
import { parseSubmission } from "../coachingData";

/** A client's answers to your start-up form, in their own words (canvas SP1/SP2). */
export async function startupAnswers(clientId: string): Promise<{ prompt: string; answer: string }[]> {
  const schedules = await getWebCheckinRepo().listMySchedules().catch(() => []);
  const ids = new Set(schedules.filter((r) => r.recipientUserId === clientId && r.schedule.kind === "startup").map((r) => r.schedule.id));
  if (!ids.size) return [];
  const items = (await coachApi.checkinInbox(365).catch(() => [])).filter((i) => i.clientUserId === clientId);
  const sub = items.map(parseSubmission).find((s): s is CheckinSubmission => !!s && ids.has(s.scheduleId) && !!s.submittedAtMs);
  if (!sub?.asked) return [];
  return sub.asked
    .filter((q) => q.type !== "heading" && q.type !== "photo")
    .map((q) => ({ prompt: q.prompt, answer: answerText(q, sub.answers.find((a) => a.questionId === q.id)) }))
    .filter((x) => x.answer && x.answer !== "–");
}

/** The answers that say what hurts or what to watch ("What hurts", "Injuries", "Anything to avoid"). */
export const hurtsAnswers = (all: { prompt: string; answer: string }[]) =>
  all.filter((a) => /hurt|injur|pain|avoid|niggle|limit/i.test(a.prompt) && !/^(no|none|nothing|nope|n\/a|na|-)\.?$/i.test(a.answer.trim()));
