// The rest service (src/lib/services/restTimerService.ts) follows each set's restStartedAtMs:
// one toast when a rest ends in the foreground, none for a rest that ended before a reload or
// while the app was in the background, and nothing for a dismissed rest.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { WorkoutSession } from "@logit/core/domain/workout";

const toast = vi.fn();
vi.mock("$lib/components/ui/sonner/index", () => ({ toast }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

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

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  toast.mockReset();
  mutate.mockClear();
  visibility = "visible";
  vi.stubGlobal("document", { get visibilityState() { return visibility; } });
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
