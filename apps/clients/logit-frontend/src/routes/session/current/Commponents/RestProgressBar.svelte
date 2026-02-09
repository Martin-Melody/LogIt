<script lang="ts">
  import { onDestroy } from "svelte";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Play } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  import { Capacitor } from "@capacitor/core";
  import { Haptics, NotificationType } from "@capacitor/haptics";
  import { LocalNotifications } from "@capacitor/local-notifications";

  const {
    setId,
    restDurationMs = 90_000,
    restStartedAtMs = null,
  } = $props<{
    setId: string;
    restDurationMs?: number;
    restStartedAtMs?: number | null;
  }>();

  let nowMs = $state(Date.now());
  let intervalId: number | null = null;

  // Pause state (UI-only)
  let paused = $state(false);
  let pausedAtMs = $state<number | null>(null);
  let pauseAccumulatedMs = $state(0);

  // Gates
  let sawActiveThisRun = $state(false);
  let didToastForStartedAt = $state<number | null>(null);
  let scheduledForStartedAt = $state<number | null>(null);

  // Unique notif id per rest cycle (stable-ish)
  function notifIdFor(startedAt: number) {
    let hash = 0;
    for (let i = 0; i < setId.length; i++) {
      hash = (hash * 31 + setId.charCodeAt(i)) | 0;
    }
    const base = Math.abs(hash) % 10000;
    return (startedAt % 1_000_000_000) + base;
  }

  async function scheduleRestFinishedNotification(
    startedAt: number,
    durMs: number,
  ) {
    if (!Capacitor.isNativePlatform()) return;

    const at = new Date(startedAt + durMs);
    const id = notifIdFor(startedAt);

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: "Rest finished",
            body: "Ready for the next set.",
            schedule: { at },
            extra: { route: "/session/current", setId },
          },
        ],
      });
    } catch {}
  }

  const rest = $derived(() => {
    const dur = Number.isFinite(restDurationMs) ? restDurationMs : 0;
    const started = restStartedAtMs;

    if (!started || dur <= 0) {
      return {
        active: false,
        pct: 0,
        remainingMs: 0,
        started: null as number | null,
      };
    }

    const effectiveNow = paused && pausedAtMs ? pausedAtMs : nowMs;

    const elapsedRaw = Math.max(0, effectiveNow - started);
    const elapsed = Math.max(0, elapsedRaw - pauseAccumulatedMs);

    const remaining = Math.max(0, dur - elapsed);
    const pct =
      dur > 0 ? Math.max(0, Math.min(100, (remaining / dur) * 100)) : 0;

    return { active: remaining > 0, pct, remainingMs: remaining, started };
  });

  // Tick only while active and not paused
  $effect(() => {
    const isActive = rest().active;

    if (isActive && !paused && intervalId == null) {
      intervalId = window.setInterval(() => (nowMs = Date.now()), 100);
    }

    if ((!isActive || paused) && intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
      nowMs = Date.now();
    }
  });

  onDestroy(() => {
    if (intervalId != null) clearInterval(intervalId);
  });

  // ✅ Schedule OS notification at rest START (works in background)
  $effect(() => {
    const r = rest();
    const started = r.started;
    const dur = Number.isFinite(restDurationMs) ? restDurationMs : 0;
    if (!started || dur <= 0) return;

    if (scheduledForStartedAt === started) return;
    scheduledForStartedAt = started;

    void scheduleRestFinishedNotification(started, dur);
  });

  async function toastAndHaptic() {
    toast.success("Rest finished", { description: "Ready for the next set." });

    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
    }
  }

  // Toast/haptic once when rest ends (while component is alive)
  $effect(() => {
    const r = rest();
    const started = r.started;
    if (!started) return;

    if (r.active) sawActiveThisRun = true;

    if (!r.active && sawActiveThisRun && didToastForStartedAt !== started) {
      didToastForStartedAt = started;
      void toastAndHaptic();
    }
  });

  function formatRemaining(ms: number) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
  }

  function pauseTimer() {
    if (paused || !rest().active) return;
    paused = true;
    pausedAtMs = Date.now();
  }

  function resumeTimer() {
    if (!paused) return;
    if (pausedAtMs) pauseAccumulatedMs += Date.now() - pausedAtMs;
    paused = false;
    pausedAtMs = null;
    nowMs = Date.now();
  }
</script>

{#if rest().active}
  <div class="col-span-full flex items-center gap-2 mt-1 pb-1 px-1">
    <span class="text-[11px] text-muted-foreground whitespace-nowrap">Rest</span
    >

    <button
      type="button"
      class="flex-1"
      aria-label="Pause rest timer"
      onclick={pauseTimer}
      disabled={paused}
    >
      <Progress value={rest().pct} max={100} class="h-2 w-full" />
    </button>

    <div class="relative w-5 h-6 flex-shrink-0">
      <div class="absolute inset-0 flex items-center justify-center">
        {#if paused}
          <Button
            variant="ghost"
            size="icon"
            class="h-6 px-2 text-[11px]"
            onclick={resumeTimer}
          >
            <Play />
          </Button>
        {:else}
          <span class="text-[11px] text-muted-foreground tabular-nums">
            {formatRemaining(rest().remainingMs)}
          </span>
        {/if}
      </div>
    </div>
  </div>
{/if}
