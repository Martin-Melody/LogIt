// How-tos (Phase 6.12/6.13, canvas HT1–HT5): for each exercise, pictures, a video, three cues,
// the most common mistake and the coach's note. LogIt's come from the exercise bank; a coach's
// own (6.13) ride on the program, so the client's phone has them with it. Videos are YouTube or
// Vimeo links, stored as provider, id and start, played in the app only when tapped (privacy-
// enhanced YouTube, Vimeo with do-not-track). LogIt-hosted clips later are just another provider.
import { CORE_MISTAKES } from "./coreMistakes";
import type { Exercise } from "./exercise";

export type HowToVideo = { provider: "youtube" | "vimeo"; id: string; startSec?: number };

/** A coach's own how-to for an exercise (6.13): what they set wins over LogIt's. */
export type CoachHowTo = {
  exerciseName: string;
  pictures?: string[];
  video?: HowToVideo;
  cues?: string[];
  mistake?: string;
  /** "Go as deep as you can with a flat back. We'll work on depth." */
  note?: string;
};

export type ExerciseHowTo = {
  exerciseName: string;
  pictures: string[];
  video: HowToVideo | null;
  cues: string[];
  mistake: string | null;
  note: string | null;
  /** Whose: the coach's, LogIt's, or the lifter's own notes. */
  from: "coach" | "logit" | "yours";
};

/** "1:05", "65", "1m5s" → seconds. */
function seconds(t: string | null): number | undefined {
  if (!t) return undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t) ?? null;
  const clock = /^(\d+):(\d{2})$/.exec(t);
  const n = clock ? Number(clock[1]) * 60 + Number(clock[2]) : m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** A YouTube or Vimeo link as provider + id + start; null for anything else (only those play). */
export function parseVideoLink(url: string): HowToVideo | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|player\.)/, "");
  const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start") ?? (u.hash.match(/t=([\dhms:]+)/)?.[1] ?? null));
  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = host === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? "");
    return /^[\w-]{6,20}$/.test(id) ? { provider: "youtube", id, ...(start ? { startSec: start } : {}) } : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.match(/(?:^|\/)(?:video\/)?(\d{6,12})(?:\/|$)/)?.[1] ?? "";
    return id ? { provider: "vimeo", id, ...(start ? { startSec: start } : {}) } : null;
  }
  return null;
}

/** The player to load when tapped: YouTube's privacy-enhanced one, or Vimeo with do-not-track. */
export function videoEmbedUrl(v: HowToVideo): string {
  if (v.provider === "youtube") return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0${v.startSec ? `&start=${v.startSec}` : ""}`;
  return `https://player.vimeo.com/video/${v.id}?dnt=1&autoplay=1${v.startSec ? `#t=${v.startSec}s` : ""}`;
}

/** "YouTube, from 0:45". */
export function videoLabel(v: HowToVideo): string {
  const at = v.startSec ? `, from ${Math.floor(v.startSec / 60)}:${String(v.startSec % 60).padStart(2, "0")}` : "";
  return `${v.provider === "youtube" ? "YouTube" : "Vimeo"}${at}`;
}

/** The how-to for an exercise: the coach's where they wrote one, LogIt's (or the lifter's own
 * cues and video) for the rest. */
export function howToFor(name: string, exercise: Pick<Exercise, "id" | "cues" | "videoUrl" | "isCore"> | null, coach?: CoachHowTo[] | null): ExerciseHowTo {
  const c = coach?.find((h) => h.exerciseName.trim().toLowerCase() === name.trim().toLowerCase());
  const own = exercise?.videoUrl ? parseVideoLink(exercise.videoUrl) : null;
  const mistake = c?.mistake ?? (exercise?.id ? CORE_MISTAKES[exercise.id] : undefined) ?? null;
  return {
    exerciseName: name,
    pictures: c?.pictures ?? [],
    video: c?.video ?? own,
    cues: (c?.cues?.length ? c.cues : exercise?.cues ?? []).filter((x) => x.trim()).slice(0, 3),
    mistake,
    note: c?.note?.trim() || null,
    from: c ? "coach" : exercise?.isCore ? "logit" : "yours",
  };
}

/** The coach's how-tos a program uses: the ones for its exercises, to go with a client's copy. */
export function howTosForProgram(program: { weeks: { days: { blocks: { type: string; exerciseName?: string }[] }[] }[] }, all: CoachHowTo[]): CoachHowTo[] {
  const names = new Set(program.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === "strength" && b.exerciseName ? [b.exerciseName.trim().toLowerCase()] : [])))));
  return all.filter((h) => names.has(h.exerciseName.trim().toLowerCase()));
}
