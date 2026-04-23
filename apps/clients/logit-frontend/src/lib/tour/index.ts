import { browser } from "$app/environment";
import { writable, get } from "svelte/store";
import { driver as createDriver } from "driver.js";

const STORAGE_KEY = "logit:tours:v1";

type TourState = {
  home: boolean;
  session: boolean;
  splits: boolean;
};

const defaults: TourState = { home: false, session: false, splits: false };

function load(): TourState {
  if (!browser) return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<TourState>) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

const _store = writable<TourState>(load());
export const tourState = { subscribe: _store.subscribe };

function markSeen(key: keyof TourState) {
  _store.update((s) => {
    const next = { ...s, [key]: true };
    if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}

export function resetTours() {
  _store.set({ ...defaults });
  if (browser) localStorage.removeItem(STORAGE_KEY);
}

export function startHomeTour(force = false) {
  if (!browser) return;
  if (get(_store).home && !force) return;
  markSeen("home");

  const d = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps: [
      {
        element: '[data-tour="quick-start"]',
        popover: {
          title: "Quick Start",
          description:
            "Start today's workout from here. If you have a split set up it loads your planned session automatically — otherwise it starts a blank session.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="todays-plan"]',
        popover: {
          title: "Today's Plan",
          description:
            "Shows the exercises scheduled for today based on your active training split. Tap Edit to jump straight to the split.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="home-customize"]',
        popover: {
          title: "Customise Home",
          description:
            "Rearrange or hide the cards on this page — show only what matters to you.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: '[data-tour="nav-splits"]',
        popover: {
          title: "Training Splits",
          description:
            "Build your weekly schedule here — e.g. Push / Pull / Legs. Set one as Active and Quick Start will automatically rotate through the days.",
          side: "top",
          align: "center",
        },
      },
      {
        element: '[data-tour="nav-sessions"]',
        popover: {
          title: "Session History",
          description:
            "Every finished workout is saved here. Tap any session to review your sets, reps, and weights.",
          side: "top",
          align: "center",
        },
      },
      {
        element: '[data-tour="nav-progress"]',
        popover: {
          title: "Progress",
          description:
            "See how your lifts have trended over time. Charts are generated automatically from your session history.",
          side: "top",
          align: "center",
        },
      },
      {
        element: '[data-tour="nav-profile"]',
        popover: {
          title: "Profile",
          description:
            "View your personal details and configure how the app suggests progression for your next sessions.",
          side: "top",
          align: "center",
        },
      },
    ],
  });

  d.drive();
}

export function startSessionTour(force = false) {
  if (!browser) return;
  if (get(_store).session && !force) return;
  markSeen("session");

  const hasExercise = !!document.querySelector('[data-tour="session-exercise-header"]');

  const allSteps = [
    hasExercise && {
      element: '[data-tour="session-exercise-header"]',
      popover: {
        title: "Exercise Card",
        description:
          "Tap the exercise name to rename it. Use + to add more sets, or swipe a row left to edit or delete it.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    hasExercise && {
      element: '[data-tour="session-set-complete"]',
      popover: {
        title: "Complete a Set",
        description:
          "Tap this circle after finishing a set. It marks the set done and starts your rest timer automatically.",
        side: "left" as const,
        align: "center" as const,
      },
    },
    {
      element: '[data-tour="session-add-exercise"]',
      popover: {
        title: "Add Exercise",
        description:
          "Tap + to search your exercise library or add a brand-new one.",
        side: "top" as const,
        align: "end" as const,
      },
    },
    {
      element: '[data-tour="session-finish"]',
      popover: {
        title: "Finish Workout",
        description:
          "Tap here when you're done. Your session is saved and progression targets are recalculated for next time.",
        side: "top" as const,
        align: "center" as const,
      },
    },
  ].filter(Boolean) as NonNullable<(typeof allSteps)[number]>[];

  const d = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps: allSteps,
  });

  d.drive();
}

export function startSplitsTour(force = false) {
  if (!browser) return;
  if (get(_store).splits && !force) return;
  markSeen("splits");

  const hasSetActive = !!document.querySelector('[data-tour="splits-set-active"]');

  const steps = [
    {
      element: '[data-tour="splits-new"]',
      popover: {
        title: "Create a Split",
        description:
          "Tap New to build a training split. Add days (e.g. Push, Pull, Legs) and fill each day with exercises.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
    hasSetActive && {
      element: '[data-tour="splits-set-active"]',
      popover: {
        title: "Set Active",
        description:
          "Only one split is active at a time. The active split is what Quick Start uses on the home screen to load today's plan.",
        side: "left" as const,
        align: "center" as const,
      },
    },
  ].filter(Boolean) as NonNullable<(typeof steps)[number]>[];

  const d = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
  });

  d.drive();
}
