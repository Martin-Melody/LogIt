// Walkthrough progress, stored on the account (GET/PUT /users/me/guide) so the web and the
// phone tick the same chapters. Both apps merge before writing, so whichever writes last
// never loses the other's ticks.

export type GuideProgress = {
  v: 1;
  /** Chapter id -> when it was finished (epoch ms). */
  done: Record<string, number>;
  /** Welcome card for a walkthrough ("pro", "studio") -> when it was closed or started. */
  welcomed: Record<string, number>;
  /** Where you stopped: chapter and step index, so "Continue" picks up there. */
  resume?: { chapter: string; step: number; at: number };
};

export const emptyProgress = (): GuideProgress => ({ v: 1, done: {}, welcomed: {} });

/** Reads whatever the server or storage held; anything unexpected becomes empty progress. */
export function parseProgress(raw: unknown): GuideProgress {
  const out = emptyProgress();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const key of ["done", "welcomed"] as const) {
    const m = r[key];
    if (m && typeof m === "object" && !Array.isArray(m)) {
      for (const [k, v] of Object.entries(m)) if (typeof v === "number" && Number.isFinite(v)) out[key][k] = v;
    }
  }
  const res = r.resume as Record<string, unknown> | undefined;
  if (res && typeof res.chapter === "string" && typeof res.step === "number" && typeof res.at === "number") {
    out.resume = { chapter: res.chapter, step: res.step, at: res.at };
  }
  return out;
}

/** Union of both: a chapter done anywhere stays done (earliest time kept); the newer resume wins. */
export function mergeProgress(a: GuideProgress, b: GuideProgress): GuideProgress {
  const pick = (x: Record<string, number>, y: Record<string, number>) => {
    const m: Record<string, number> = { ...x };
    for (const [k, v] of Object.entries(y)) m[k] = k in m ? Math.min(m[k], v) : v;
    return m;
  };
  const resume = !a.resume ? b.resume : !b.resume ? a.resume : a.resume.at >= b.resume.at ? a.resume : b.resume;
  const merged: GuideProgress = { v: 1, done: pick(a.done, b.done), welcomed: pick(a.welcomed, b.welcomed) };
  // A resume point for a chapter that's since been finished is stale.
  if (resume && !(resume.chapter in merged.done)) merged.resume = resume;
  return merged;
}

export function markDone(p: GuideProgress, chapterId: string, now: number): GuideProgress {
  const next: GuideProgress = { ...p, done: { ...p.done, [chapterId]: p.done[chapterId] ?? now } };
  if (next.resume?.chapter === chapterId) delete next.resume;
  return next;
}

/** Replaying a chapter: it stops counting as done until it's finished again. */
export function markUndone(p: GuideProgress, chapterId: string): GuideProgress {
  const done = { ...p.done };
  delete done[chapterId];
  return { ...p, done };
}
