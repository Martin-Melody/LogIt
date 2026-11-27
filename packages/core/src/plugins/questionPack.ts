import type { CheckinQuestion, CheckinQuestionType } from "../domain/Checkin";

/**
 * Question packs (canvas W8/W9 "check-in question type"): data, a set of check-in questions a
 * coach adds to a form, like a climbing plugin's "Finger pain" and "Skin". No code. Answers go
 * into the form like any other question's, so nothing here reads client data.
 */

export const QUESTION_PACK_FORMAT_VERSION = 1 as const;
export const MAX_PACK_QUESTIONS = 30;
const TYPES: CheckinQuestionType[] = ["text", "number", "scale", "boolean", "choice", "weight", "measurement", "heading"];

export type PackQuestion = Omit<CheckinQuestion, "id">;
export type QuestionPack = { formatVersion: 1; pluginId: string; questions: PackQuestion[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseQuestionPack(raw: unknown, pluginId: string): QuestionPack {
  if (!isObject(raw)) throw new Error("This pack isn't a question pack.");
  if (raw.formatVersion !== QUESTION_PACK_FORMAT_VERSION) throw new Error("This pack needs a newer LogIt.");
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) throw new Error("This pack has no questions.");
  if (raw.questions.length > MAX_PACK_QUESTIONS) throw new Error(`A pack can have up to ${MAX_PACK_QUESTIONS} questions.`);
  const questions = raw.questions.map((q, i): PackQuestion => {
    if (!isObject(q) || typeof q.prompt !== "string" || !q.prompt.trim() || q.prompt.length > 200) throw new Error(`Question ${i + 1} needs a prompt (up to 200 characters).`);
    if (!TYPES.includes(q.type as CheckinQuestionType)) throw new Error(`"${q.prompt}" has a type LogIt doesn't ask (use ${TYPES.join(", ")}).`);
    if (q.type === "choice" && (!Array.isArray(q.options) || q.options.length < 2 || q.options.some((o) => typeof o !== "string"))) throw new Error(`"${q.prompt}" needs two or more options.`);
    const out: PackQuestion = { prompt: q.prompt.trim(), type: q.type as CheckinQuestionType };
    if (typeof q.help === "string") out.help = q.help.slice(0, 300);
    if (q.type === "scale") { out.scaleMin = typeof q.scaleMin === "number" ? q.scaleMin : 1; out.scaleMax = typeof q.scaleMax === "number" ? q.scaleMax : 10; }
    if (q.type === "choice") { out.options = (q.options as string[]).slice(0, 12).map((o) => o.slice(0, 60)); out.multi = q.multi === true; }
    if (q.type === "text") out.long = q.long === true;
    if (q.required === true) out.required = true;
    return out;
  });
  return { formatVersion: QUESTION_PACK_FORMAT_VERSION, pluginId, questions };
}
