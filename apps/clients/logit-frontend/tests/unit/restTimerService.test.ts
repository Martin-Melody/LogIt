// The rest service (src/lib/services/restTimerService.ts) follows each set's restStartedAtMs:
// one toast when a rest ends in the foreground, none for a rest that ended before a reload or
// while the app was in the background, and nothing for a dismissed rest.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { WorkoutSession } from "@logit/core/domain/workout";

const toast = vi.fn();
vi.mock("$lib/components/ui/sonner/index", () => ({ toast }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
const schedule = vi.fn(async () => {});
const cancel = vi.fn(async () => {});
const exactAlarm = { state: "granted" };
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    requestPermissions: async () => ({ display: "granted" }),
    checkExactNotificationSetting: async () => ({ exact_alarm: exactAlarm.state }),
    schedule,
    cancel,
  },
}));
vi.mock("$lib/features/sound/sounds", () => ({ playSound: vi.fn() }));

const profileStore = writable({ restDefaults: { normal: 60_000 } as Record<string, number | undefined> });
vi.mock("$lib/stores/profile.store", () => ({ profile: profileStore }));

// Stand-in for the current-session store: a plain store plus the serialized mutate().
const sessionStore = writable<WorkoutSession | null>(null);
const mutate = vi.fn(async (updater: (s: WorkoutSession) => WorkoutSession) => {
  const s = get(sessionStore);
  if (!s) return null;
  const next = updater(s);
  if (next !== s) sessionStore.set(next);
  return next;
});
vi.mock("$lib/stores/currentSession.store", () => ({
  currentSession: { subscribe: sessionStore.subscribe, mutate },
}));

function workout(restStartedAtMs: number | null): WorkoutSession {
  return {
    id: "w",
    startedAtMs: 0,
    blocks: [
      {
        id: "b",
        type: "strength",
        orderIndex: 0,
        data: {
          exerciseName: "Squat",
          sets: [{ id: "s1", setType: "normal", reps: 5, weight: 100, orderIndex: 0, completed: true, restStartedAtMs }],
        },
      },
    ],
  };
}

const restOf = () =>
  ((get(sessionStore)!.blocks[0]!.data as { sets: { restStartedAtMs?: number | null }[] }).sets[0]!.restStartedAtMs);

let visibility: "visible" | "hidden" = "visible";
// The service listens once (startRestTimers runs once per module), so the handler is kept here.
let onVisibility: (() => void) | null = null;
async function setVisibility(v: "visible" | "hidden") {
  visibility = v;
  onVisibility?.();
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  toast.mockReset();
  localStorage.clear();
  mutate.mockClear();
  visibility = "visible";
  schedule.mockClear();
  cancel.mockClear();
  vi.stubGlobal("document", {
    get visibilityState() { return visibility; },
    addEventListener: (type: string, fn: () => void) => { if (type === "visibilitychange") onVisibility = fn; },
  });
  sessionStore.set(null);
  const { startRestTimers } = await import("$lib/services/restTimerService");
  startRestTimers();
});

afterEach(() => {
  sessionStore.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("rest timer", () => {
  it("toasts once when a rest ends, then clears it", async () => {
    sessionStore.set(workout(Date.now()));
    await advance(59_000);
    expect(toast).not.toHaveBeenCalled();
    await advance(1_000);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(restOf()).toBeNull();
    await advance(120_000);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("a rest that ended before a reload is cleared without a toast", async () => {
    sessionStore.set(workout(Date.now() - 5 * 60_000));
    await advance(0);
    expect(toast).not.toHaveBeenCalled();
    expect(restOf()).toBeNull();
  });

  it("a rest still running after a reload alerts at its original end", async () => {
    sessionStore.set(workout(Date.now() - 45_000));
    await advance(14_000);
    expect(toast).not.toHaveBeenCalled();
    await advance(1_000);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("a dismissed rest never alerts", async () => {
    sessionStore.set(workout(Date.now()));
    await advance(10_000);
    sessionStore.set(workout(null)); // dismissed / unticked
    await advance(120_000);
    expect(toast).not.toHaveBeenCalled();
  });

  it("in the app it's only the chime and toast: the phone notification is booked on leaving and taken back on return", async () => {
    sessionStore.set(workout(Date.now()));
    await advance(10_000);
    expect(schedule).not.toHaveBeenCalled();
    await setVisibility("hidden");
    expect(schedule).toHaveBeenCalledTimes(1);
    expect((schedule.mock.calls[0] as unknown as [{ notifications: { schedule: { at: Date } }[] }])[0].notifications[0]!.schedule.at.getTime()).toBe(1_000_000 + 60_000);
    await setVisibility("visible");
    expect(cancel).toHaveBeenCalled();
    await advance(50_000);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("without the exact-alarm permission it books an inexact alarm (no trip to Android's settings)", async () => {
    exactAlarm.state = "denied";
    try {
      sessionStore.set(workout(Date.now()));
      await advance(10_000);
      await setVisibility("hidden");
      expect((schedule.mock.calls[0] as unknown as [{ notifications: { isExactNotification: boolean }[] }])[0].notifications[0]!.isExactNotification).toBe(false);
    } finally {
      exactAlarm.state = "granted";
    }
  });

  it("asks once, at the first rest, for exact alarms when Android hasn't allowed them", async () => {
    exactAlarm.state = "denied";
    try {
      sessionStore.set(workout(Date.now()));
      await advance(0);
      expect(toast).toHaveBeenCalledTimes(1);
      expect((toast.mock.calls[0] as unknown as [string, { action: { label: string } }])[1].action.label).toBe("Allow");
      sessionStore.set(workout(null));
      sessionStore.set(workout(Date.now()));
      await advance(0);
      expect(toast).toHaveBeenCalledTimes(1);
    } finally {
      exactAlarm.state = "granted";
    }
  });

  it("no toast when the rest ended while the app was in the background", async () => {
    sessionStore.set(workout(Date.now()));
    visibility = "hidden";
    await advance(60_000);
    expect(toast).not.toHaveBeenCalled();
    expect(restOf()).toBeNull();
  });

  it("re-ticking the set restarts the rest from then", async () => {
    sessionStore.set(workout(Date.now()));
    await advance(30_000);
    sessionStore.set(workout(Date.now())); // ticked again: a new rest
    await advance(45_000);
    expect(toast).not.toHaveBeenCalled();
    await advance(15_000);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
