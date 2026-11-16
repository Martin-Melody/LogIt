// The phone's short tours. Their steps live in @logit/core/guide/walkthroughs (the phone
// chapters), next to the web walkthroughs, and consistency.test.ts checks every step's
// data-guide mark exists here. A screen calls autoTour("app.home") when it opens: the tour
// runs the first time only, or when Settings › Walkthroughs asked to replay it.
import { browser } from "$app/environment";
import { writable, get } from "svelte/store";
import { driver as createDriver, type DriveStep } from "driver.js";
import { CHAPTERS } from "@logit/core/guide/walkthroughs";
import type { Chapter } from "@logit/core/guide/types";
import { guideApi } from "@logit/core/api/guideApi";
import { markDone } from "@logit/core/guide/progress";
import { apiClient } from "@logit/core/api/client";

type DriverInstance = ReturnType<typeof createDriver>;
let currentDriver: DriverInstance | null = null;

export function destroyActiveTour() {
  if (currentDriver?.isActive()) currentDriver.destroy();
  currentDriver = null;
}

const STORAGE_KEY = "logit:tours:v2";
const LEGACY_KEY = "logit:tours:v1";
const REPLAY_KEY = "logit:tours:replay";
/** The v1 tours, by their old names. */
const LEGACY: Record<string, string> = {
  home: "app.home", session: "app.session", splits: "app.splits", splitDetail: "app.split-detail",
  splitDay: "app.split-day", exercises: "app.exercises", profile: "app.profile",
};

/** Chapter ids this phone has shown (so they don't start by themselves again) or finished. */
type TourState = { seen: Record<string, true>; done: Record<string, number> };

function load(): TourState {
  const state: TourState = { seen: {}, done: {} };
  if (!browser) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...state, ...(JSON.parse(raw) as Partial<TourState>) };
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}") as Record<string, boolean>;
    for (const [k, v] of Object.entries(legacy)) if (v && LEGACY[k]) state.seen[LEGACY[k]] = true;
  } catch {
    // Unreadable: start fresh.
  }
  return state;
}

const _store = writable<TourState>(load());
export const tourState = { subscribe: _store.subscribe };

function save(next: TourState) {
  _store.set(next);
  if (browser) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the tour may show again, nothing worse.
    }
  }
}

export function resetTours() {
  save({ seen: {}, done: {} });
  if (browser) localStorage.removeItem(LEGACY_KEY);
}

/** The chapters that have phone steps, for Settings › Walkthroughs. */
export const phoneChapters = (): Chapter[] => CHAPTERS.filter((c) => c.steps.some((s) => s.on === "phone"));

/** Settings › Walkthroughs: replay `id` when its screen next opens. */
export function requestReplay(id: string) {
  if (browser) sessionStorage.setItem(REPLAY_KEY, id);
}

/** Called by a screen when it opens. */
export function autoTour(id: string) {
  if (!browser) return;
  const replay = sessionStorage.getItem(REPLAY_KEY) === id;
  if (replay) sessionStorage.removeItem(REPLAY_KEY);
  startChapter(id, replay);
}

/** For tours that never start by themselves (the Pro and Studio ones): only when asked from Settings. */
export function replayTour(id: string) {
  if (!browser || sessionStorage.getItem(REPLAY_KEY) !== id) return;
  sessionStorage.removeItem(REPLAY_KEY);
  startChapter(id, true);
}

export function startChapter(id: string, force = false) {
  if (!browser) return;
  const chapter = CHAPTERS.find((c) => c.id === id);
  if (!chapter) return;
  const state = get(_store);
  if (state.seen[id] && !force) return;

  // Only the steps whose part of the screen is showing (e.g. no exercise card in an empty workout).
  const steps: DriveStep[] = chapter.steps
    .filter((s) => s.on === "phone" && s.target && document.querySelector(`[data-guide='${s.target}']`))
    .map((s) => ({
      element: `[data-guide='${s.target}']`,
      popover: { title: s.title, description: s.body, side: "bottom", align: "center" },
    }));
  // Nothing of it on screen (e.g. a Pro tour on a Free account): try again another time.
  if (steps.length === 0) return;
  save({ ...state, seen: { ...state.seen, [id]: true } });

  destroyActiveTour();
  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
    onDestroyStarted: (_el, _step, opts) => {
      // Finished when closed on the last step; closing early only counts as seen.
      if (opts.driver.isLastStep()) void recordDone(id);
      opts.driver.destroy();
    },
  });
  currentDriver.drive();
}

/** A finished chapter is ticked here and, when signed in, on the account (the web shows it too). */
async function recordDone(id: string) {
  const state = get(_store);
  save({ ...state, done: { ...state.done, [id]: Date.now() } });
  if (!apiClient.isAuthenticated()) return;
  try {
    await guideApi.save(markDone(await guideApi.get(), id, Date.now()));
  } catch {
    // Offline: the local tick stays; the account catches up next time a chapter finishes.
  }
}
