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

  const holdDisplay = $derived(
    running ? fmt(elapsed) : set.durationSec ? fmt(set.durationSec) : prev?.durationSec ? fmt(prev.durationSec) : "–",
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

<div class="grid grid-cols-[1.5rem_1fr_auto] gap-2 items-center px-3 py-1.5 transition-opacity {set.completed ? 'opacity-60' : ''}">
  <span class="text-xs text-muted-foreground tabular-nums text-center">{label ?? ""}</span>

  <div class="flex items-center gap-2 min-w-0">
    {#if metric === "hold"}
      <button
        type="button"
        class="relative h-8 w-8 shrink-0 flex items-center justify-center rounded-full border-2 {running ? 'border-primary text-primary' : 'border-muted-foreground/40 hover:border-primary'}"
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
        {#if running}<Square class="h-3 w-3" />{:else}<Play class="h-3 w-3" />{/if}
      </button>
      <span class="text-sm tabular-nums font-medium">
        {holdDisplay}{#if target && !running}<span class="text-muted-foreground font-normal"> / {target}s</span>{/if}
      </span>
    {:else}
      <button type="button" class="h-7 w-7 shrink-0 flex items-center justify-center rounded border text-muted-foreground hover:text-foreground disabled:opacity-30"
        {disabled} aria-label="One fewer rep"
        onclick={() => void onPatch({ reps: Math.max(0, (set.reps ?? 0) - 1) || undefined })}>
        <Minus class="h-3 w-3" />
      </button>
      <input
        class="w-14 shrink-0 rounded border bg-background px-1.5 py-1 text-sm tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-ring"
        type="number" min="0" inputmode="numeric"
        placeholder={prevReps ?? "0"}
        value={set.reps ? String(set.reps) : ""}
        {disabled}
        onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        onchange={(e) => void onPatch({ reps: num((e.currentTarget as HTMLInputElement).value) || undefined })}
      />
      <button type="button" class="h-7 w-7 shrink-0 flex items-center justify-center rounded border text-muted-foreground hover:text-foreground"
        {disabled} aria-label="One more rep"
        onclick={() => void onPatch({ reps: (set.reps ?? 0) + 1 })}>
        <Plus class="h-3 w-3" />
      </button>
    {/if}

    <input
      class="w-14 shrink-0 ml-auto rounded border bg-background px-1.5 py-1 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
      type="number" min="0" step={weightUnit === "lbs" ? "1" : "0.5"}
      placeholder={prevLoad ?? "±kg"}
      value={displayLoad}
      {disabled}
      title="Added load"
      onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
      onchange={(e) => {
        const v = num((e.currentTarget as HTMLInputElement).value);
        void onPatch({ loadKg: v > 0 ? fromDisplayWeight(v, weightUnit) : undefined });
      }}
    />
  </div>

  <button
    type="button"
    class="h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0
      {set.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary'}"
    onclick={() => void onComplete()}
    {disabled}
    aria-label={set.completed ? "Mark incomplete" : "Mark complete"}
  >
    {#if set.completed}<Check class="h-3 w-3" />{/if}
  </button>
</div>
