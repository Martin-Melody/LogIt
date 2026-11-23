<script lang="ts">
  import { Check, Play, Square, Minus, Plus } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, trimWeight } from "@logit/core/domain/units";
  import type { MobilityMetric, MobilitySet } from "@logit/core/domain/workout";
  import { motionOK } from "$lib/transitions";

  const {
    metric,
    set,
    label = null,
    prev = null,
    weightUnit = "kg",
    disabled = false,
    onPatch,
    onComplete,
  } = $props<{
    metric: MobilityMetric;
    set: MobilitySet;
    /** "1", "L", "R" — shown in the leading cell. */
    label?: string | null;
    prev?: { durationSec?: number; reps?: number; loadKg?: number } | null;
    weightUnit?: WeightUnit;
    disabled?: boolean;
    onPatch: (patch: Partial<MobilitySet>) => void | Promise<void>;
    onComplete: () => void | Promise<void>;
  }>();

  // ── Hold timer (count-up, local) ─────────────────────────────────────────────
  let running = $state(false);
  let elapsed = $state(0);
  let startedAt = 0;
  let raf = 0;

  function tick() {
    elapsed = (Date.now() - startedAt) / 1000;
    raf = requestAnimationFrame(tick);
  }
  function startTimer() {
    if (disabled) return;
    running = true;
    startedAt = Date.now();
    elapsed = 0;
    raf = requestAnimationFrame(tick);
  }
  async function stopTimer() {
    running = false;
    cancelAnimationFrame(raf);
    const secs = Math.round(elapsed);
    if (secs > 0) await onPatch({ durationSec: secs, completed: true });
  }
  onDestroy(() => cancelAnimationFrame(raf));

  function fmt(s: number): string {
    const t = Math.max(0, Math.round(s));
    const m = Math.floor(t / 60);
    return m > 0 ? `${m}:${String(t % 60).padStart(2, "0")}` : `${t}s`;
  }

  const target = $derived(typeof set.targetSec === "number" && set.targetSec > 0 ? set.targetSec : null);
  const ringPct = $derived(
    running && target ? Math.min(1, elapsed / target) : set.durationSec && target ? Math.min(1, set.durationSec / target) : 0,
  );
  const R = 13;
  const C = 2 * Math.PI * R;

  // Before the hold there is nothing held yet: show just the goal (muted)
  // rather than "39s / 39s", which read as if it had already been done.
  const holdDisplay = $derived(
    running ? fmt(elapsed) : set.durationSec ? fmt(set.durationSec) : target ? null : prev?.durationSec ? fmt(prev.durationSec) : "–",
  );

  // ── Load ────────────────────────────────────────────────────────────────────
  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const displayLoad = $derived(
    set.loadKg ? trimWeight(roundDisplayWeight(toDisplayWeight(set.loadKg, weightUnit), weightUnit)) : "",
  );
  const prevLoad = $derived(
    prev?.loadKg ? trimWeight(roundDisplayWeight(toDisplayWeight(prev.loadKg, weightUnit), weightUnit)) : null,
  );

  const prevReps = $derived(prev?.reps ? String(prev.reps) : null);
</script>

<!-- The strength set row's grid (merged design): label, last time, two number boxes, tick.
     A hold keeps its start/stop timer beside last time. -->
<div class="grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_3.25rem_2.75rem] items-center gap-1.5 px-3 py-0.5 transition-colors {set.completed ? 'bg-muted/40' : ''}">
  <span class="text-center text-xs font-medium text-muted-foreground tabular-nums">{label ?? ""}</span>

  {#if metric === "hold"}
    <div class="flex min-w-0 items-center gap-2">
      <button
        type="button"
        class="relative h-10 w-10 shrink-0 flex items-center justify-center rounded-full border-2 {running ? 'border-primary text-primary' : 'border-muted-foreground hover:border-primary'}"
        onclick={() => (running ? void stopTimer() : startTimer())}
        {disabled}
        aria-label={running ? "Stop hold timer" : "Start hold timer"}
      >
        {#if target}
          <svg class="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx="16" cy="16" r={R} fill="none" stroke="currentColor" stroke-width="2"
              stroke-dasharray={C}
              stroke-dashoffset={C * (1 - ringPct)}
              style={motionOK() ? "transition: stroke-dashoffset 200ms linear" : ""}
            />
          </svg>
        {/if}
        {#if running}<Square class="h-3.5 w-3.5" />{:else}<Play class="h-3.5 w-3.5" />{/if}
      </button>
      <span class="min-w-0 truncate text-[13px] tabular-nums text-muted-foreground">
        {running ? fmt(elapsed) : prev?.durationSec ? fmt(prev.durationSec) : ""}
      </span>
    </div>
    <input
      class="h-10 w-full rounded-md border border-border bg-background px-2 text-center text-[15px] font-semibold tabular-nums placeholder:font-medium placeholder:text-info focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      type="number" min="0" inputmode="numeric"
      placeholder={target ? String(target) : prev?.durationSec ? String(prev.durationSec) : "s"}
      aria-label="Seconds held{set.side ? `, ${set.side}` : ''}"
      value={set.durationSec ? String(set.durationSec) : ""}
      {disabled}
      onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
      onchange={(e) => void onPatch({ durationSec: num((e.currentTarget as HTMLInputElement).value) || undefined })}
    />
  {:else}
    <span class="h-10 min-w-0 truncate text-[13px] leading-10 tabular-nums text-muted-foreground">{prevReps ? `× ${prevReps}` : ""}</span>
    <input
      class="h-10 w-full rounded-md border border-border bg-background px-2 text-center text-[15px] font-semibold tabular-nums placeholder:font-medium placeholder:text-info focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      type="number" min="0" inputmode="numeric"
      placeholder={prevReps ?? "0"}
      aria-label="Reps{set.side ? `, ${set.side}` : ''}"
      value={set.reps ? String(set.reps) : ""}
      {disabled}
      onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
      onchange={(e) => void onPatch({ reps: num((e.currentTarget as HTMLInputElement).value) || undefined })}
    />
  {/if}

  <input
    class="h-10 w-full rounded-md border border-border bg-background px-1 text-center text-sm tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    type="number" min="0" step={weightUnit === "lbs" ? "1" : "0.5"}
    placeholder={prevLoad ?? "+kg"}
    value={displayLoad}
    {disabled}
    title="Added load"
    aria-label="Added load ({weightUnit}){set.side ? `, ${set.side}` : ''}"
    onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
    onchange={(e) => {
      const v = num((e.currentTarget as HTMLInputElement).value);
      void onPatch({ loadKg: v > 0 ? fromDisplayWeight(v, weightUnit) : undefined });
    }}
  />

  <button
    type="button"
    class="flex h-11 w-11 items-center justify-center justify-self-center"
    onclick={() => void onComplete()}
    {disabled}
    aria-label={set.completed ? "Mark incomplete" : "Mark complete"}
  >
    <span
      class="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors
        {set.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground hover:border-primary'}"
    >
      {#if set.completed}<Check class="h-3 w-3" />{/if}
    </span>
  </button>
</div>
