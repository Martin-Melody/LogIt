// The walkthroughs on the web: which chapter and step is showing, progress (saved to the
// account so the phone shares it), and the Guide panel. The steps themselves come from
// @logit/core/guide/walkthroughs; GuideLayer.svelte draws the current one.
import { goto } from "$app/navigation";
import { apiClient } from "@logit/core/api/client";
import { guideApi } from "@logit/core/api/guideApi";
import { CHAPTERS } from "@logit/core/guide/walkthroughs";
import { emptyProgress, markDone, markUndone, routeMatches, type GuideProgress } from "@logit/core/guide/progress";
import type { Chapter, Step, Walkthrough } from "@logit/core/guide/types";
import { onGuideSignal } from "./signal";

const LOCAL_KEY = "logit-web:guide:v1";

function readLocal(): { studioMode?: "samples" | "real"; hidden?: Record<string, boolean> } {
  try {
    return JSON.parse(localStorage.getItem(`${LOCAL_KEY}:${apiClient.getUser()?.id ?? "anon"}`) ?? "{}");
  } catch {
    return {};
  }
}

function writeLocal(v: ReturnType<typeof readLocal>) {
  try {
    localStorage.setItem(`${LOCAL_KEY}:${apiClient.getUser()?.id ?? "anon"}`, JSON.stringify(v));
  } catch {
    // Private window: the choice just isn't remembered.
  }
}

/** Which walkthroughs this account sees. Studio gets both. */
export function walkthroughsFor(tier: string | undefined, selfHosted: boolean): Walkthrough[] {
  if (selfHosted || tier === "Studio") return ["studio", "pro"];
  if (tier === "Pro") return ["pro"];
  return [];
}

export const chaptersOf = (w: Walkthrough): Chapter[] => CHAPTERS.filter((c) => c.walkthrough === w);

class Guide {
  progress = $state<GuideProgress>(emptyProgress());
  loaded = $state(false);
  panelOpen = $state(false);
  active = $state<{ chapterId: string; index: number } | null>(null);
  paused = $state(false);
  /** Studio chapters: practise on sample clients, or on real clients (their "do" steps become "look"). */
  studioMode = $state<"samples" | "real" | null>(null);
  /** Shown when a Studio chapter starts and the coach hasn't picked samples or real clients yet. */
  askStudioMode = $state<string | null>(null);

  constructor() {
    onGuideSignal((name) => this.onSignal(name));
  }

  get chapter(): Chapter | null {
    return this.active ? CHAPTERS.find((c) => c.id === this.active!.chapterId) ?? null : null;
  }

  get step(): Step | null {
    return this.chapter?.steps[this.active!.index] ?? null;
  }

  /** "look" or "do" as the step should behave now. */
  get stepKind(): "look" | "do" {
    const s = this.step;
    if (!s) return "look";
    if (s.kind === "do" && this.chapter?.usesSamples && this.studioMode === "real") return "look";
    return s.kind;
  }

  private loadedFor: string | null = null;

  async load() {
    const who = apiClient.getUser()?.id ?? null;
    if (!who || this.loadedFor === who) return;
    this.loadedFor = who;
    this.loaded = false;
    this.progress = emptyProgress();
    this.active = null;
    this.studioMode = readLocal().studioMode ?? null;
    try {
      this.progress = await guideApi.get();
    } catch {
      // Offline: start empty; the next save merges.
    }
    this.loaded = true;
  }

  /** "Show me in the app" on a docs page links to /?guide=<chapter>: start it once loaded. */
  async startFromLink(url: URL) {
    const id = url.searchParams.get("guide");
    if (!id) return;
    await this.load();
    if (!CHAPTERS.some((c) => c.id === id)) return;
    const clean = new URL(url);
    clean.searchParams.delete("guide");
    await goto(clean.pathname + clean.search, { replaceState: true });
    this.start(id);
  }

  private persist() {
    void guideApi.save(this.progress).then((merged) => (this.progress = merged)).catch(() => {});
  }

  isDone(chapterId: string) {
    return chapterId in this.progress.done;
  }

  doneCount(w: Walkthrough) {
    return chaptersOf(w).filter((c) => this.isDone(c.id)).length;
  }

  /** The first chapter not done yet, for "Continue". */
  nextChapter(w: Walkthrough): Chapter | null {
    return chaptersOf(w).find((c) => !this.isDone(c.id)) ?? null;
  }

  welcomed(w: Walkthrough) {
    return w in this.progress.welcomed;
  }

  dismissWelcome(w: Walkthrough) {
    this.progress = { ...this.progress, welcomed: { ...this.progress.welcomed, [w]: Date.now() } };
    this.persist();
  }

  chooseStudioMode(mode: "samples" | "real") {
    this.studioMode = mode;
    writeLocal({ ...readLocal(), studioMode: mode });
    const pending = this.askStudioMode;
    this.askStudioMode = null;
    if (pending) this.start(pending);
  }

  start(chapterId: string, index = 0) {
    const chapter = CHAPTERS.find((c) => c.id === chapterId);
    if (!chapter) return;
    if (chapter.walkthrough === "studio" && !this.studioMode) {
      this.askStudioMode = chapterId;
      this.panelOpen = false;
      return;
    }
    if (!this.welcomed(chapter.walkthrough)) this.dismissWelcome(chapter.walkthrough);
    if (this.isDone(chapterId)) this.progress = markUndone(this.progress, chapterId);
    this.panelOpen = false;
    this.paused = false;
    this.active = { chapterId, index };
    this.goToStepPage();
  }

  /** Static pages are opened for you; a page with an id in it (one client) is reached by the step before. */
  private goToStepPage() {
    const s = this.step;
    if (!s || /\[/.test(s.route)) return;
    if (!routeMatches(s.route, location.pathname)) void goto(s.route);
  }

  next() {
    if (!this.active || !this.chapter) return;
    if (this.active.index + 1 >= this.chapter.steps.length) return this.finishChapter();
    this.active = { ...this.active, index: this.active.index + 1 };
    this.saveResume();
    this.goToStepPage();
  }

  back() {
    if (!this.active || this.active.index === 0) return;
    this.active = { ...this.active, index: this.active.index - 1 };
    this.goToStepPage();
  }

  private saveResume() {
    if (!this.active) return;
    this.progress = { ...this.progress, resume: { chapter: this.active.chapterId, step: this.active.index, at: Date.now() } };
    this.persist();
  }

  /** Close the step but keep your place; the pill and "Continue" bring it back. */
  pause() {
    this.saveResume();
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.goToStepPage();
  }

  /** Leave the chapter (Esc). */
  stop() {
    this.saveResume();
    this.active = null;
    this.paused = false;
  }

  /** Chapters finished in this visit, so the Studio finish dialog can show once at the end. */
  justFinished = $state<string | null>(null);

  finishChapter() {
    if (!this.active) return;
    const id = this.active.chapterId;
    this.progress = markDone(this.progress, id, Date.now());
    this.persist();
    this.active = null;
    this.justFinished = id;
    this.panelOpen = true;
  }

  private onSignal(name: string) {
    const s = this.step;
    if (!s || this.paused) return;
    if (s.kind === "do" && s.signal === name) this.next();
  }
}

export const guide = new Guide();
