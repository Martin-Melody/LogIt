import type { AskQuestion } from "@logit/core/domain/coachRequest";
import { touchCheckinSchedule, type CheckinSchedule } from "@logit/core/domain/Checkin";

/** The ask-to-be-coached questions in the form editor's shape (written or choose one). */
export function askToForm(questions: AskQuestion[]): CheckinSchedule {
  const now = Date.now();
  return {
    id: "ask", name: "Ask to be coached", cadence: "manual", anchorMs: now, archived: false, createdAtMs: now, updatedAtMs: now,
    questions: questions.map((q) => ({
      id: q.id, prompt: q.label, type: q.kind === "choice" ? "choice" : "text", required: !q.optional,
      ...(q.kind === "choice" ? { options: q.options ?? [] } : {}),
    })),
  };
}

/** Back to the server's shape; anything that isn't a choice is written. */
export function formToAsk(form: CheckinSchedule): AskQuestion[] {
  return touchCheckinSchedule(form).questions.filter((q) => q.type !== "heading").map((q) => ({
    id: q.id, label: q.prompt.trim() || "Question", kind: q.type === "choice" ? "choice" : "text",
    options: q.type === "choice" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : null, optional: !q.required,
  }));
}
