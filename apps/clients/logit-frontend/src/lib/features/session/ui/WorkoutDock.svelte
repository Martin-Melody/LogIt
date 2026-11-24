<script lang="ts">
  import { Music, Plus } from "lucide-svelte";
  import { get } from "svelte/store";
  import {
    adjustRest,
    clearRest,
    getRunningRests,
    type StrengthBlockData,
    type WorkoutSession,
  } from "@logit/core/domain/workout";
  import { formatLoad } from "@logit/core/domain/units";
  import { profile } from "$lib/stores/profile.store";
  import MusicBar from "$lib/features/music/MusicBar.svelte";

  // The workout's bottom bar (merged design): it stands in for the nav during a workout.
  // "Add to workout" and the music button; while a rest runs, the rest takes Add's place
  // with a big clock, the set that's next, and −15 / +15 / Skip under them (canvas "Rest bar"
  // B, 24 Nov: easy to read from the bench); the music button moves into the clock row. A
  // track playing shows the now-playing bar above it.
  const {
    session,
    disabled = false,
    onAdd,
    onMutate,
  }: {
    session: WorkoutSession | null;
    disabled?: boolean;
    onAdd: () => void;
    onMutate: (updater: (s: WorkoutSession) => WorkoutSession, opts?: { auto?: boolean }) => Promise<void>;
  } = $props();

  let musicBar = $state<MusicBar | null>(null);
  let musicPlaying = $state(false);
  let musicAvailable = $state(false);

  let now = $state(Date.now());
  const rest = $derived.by(() => {
    if (!session) return null;
    const running = getRunningRests(session, $profile.restDefaults);
    return running.sort((a, b) => b.startedAtMs - a.startedAtMs)[0] ?? null;
  });
  $effect(() => {
    if (!rest) return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(id);
  });
  const remainingMs = $derived(rest ? Math.max(0, rest.endsAtMs - now) : 0);
  const progress = $derived(rest ? Math.min(1, (now - rest.startedAtMs) / Math.max(1, rest.endsAtMs - rest.startedAtMs)) : 0);
  const clock = $derived.by(() => {
    const total = Math.ceil(remainingMs / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  });

  /** "Then 90.5 × 8", or "Then Face Pull · 25 × 15" when the next set is another exercise. */
  const nextLine = $derived.by(() => {
    if (!session || !rest) return null;
    const blocks = [...session.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const from = blocks.findIndex((b) => b.type === "strength" && (b.data as StrengthBlockData).sets.some((s) => s.id === rest.setId));
    if (from === -1) return null;
    for (let i = from; i < blocks.length; i++) {
      const b = blocks[i]!;
      if (b.type !== "strength") continue;
      const d = b.data as StrengthBlockData;
      const set = [...d.sets].sort((x, y) => x.orderIndex - y.orderIndex).find((s) => !s.completed && s.setType !== "warmup");
      if (!set) continue;
      const kg = set.weight || set.target?.weight || 0;
      const reps = set.reps || set.target?.reps || 0;
      const load = kg > 0 ? `${formatLoad(kg, get(profile).weightUnit, false)} × ${reps}` : `× ${reps}`;
      return i === from ? load : `${d.exerciseName} · ${load}`;
    }
    return null;
  });

  function nudge(deltaMs: number) {
    const r = rest;
    if (!r) return;
    void onMutate((s) => adjustRest(s, r.setId, deltaMs, get(profile).restDefaults), { auto: true });
  }
  function skip() {
    const r = rest;
    if (!r) return;
    void onMutate((s) => clearRest(s, r.setId, r.startedAtMs), { auto: true });
  }

  const restBtn = "flex h-11 items-center justify-center rounded-md border border-input bg-background text-[15px] font-medium tabular-nums transition-colors hover:bg-muted";
</script>

<div class="flex flex-col gap-2 border-t border-border bg-background px-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
  <div class={musicPlaying ? "" : "hidden"}>
    <MusicBar bind:this={musicBar} bind:visible={musicPlaying} bind:available={musicAvailable} playingOnly />
  </div>
  <div class="flex gap-2">
    {#if rest}
      <div class="relative flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-muted/60 px-3 pt-3 pb-3.5"
        role="timer" aria-live="off" aria-label="Rest timer, {clock} left">
        <div class="flex items-center gap-3.5">
          <span class="text-[34px] leading-9 font-bold tracking-tight tabular-nums">{clock}</span>
          <span class="flex min-w-0 flex-1 flex-col text-[13px] leading-[18px] text-muted-foreground">
            {nextLine ? "Rest, then" : "Rest"}
            {#if nextLine}<span class="line-clamp-2 text-base font-semibold text-info">{nextLine}</span>{/if}
          </span>
          {#if musicAvailable}{@render musicButton("size-11 bg-background")}{/if}
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button type="button" class={restBtn} aria-label="15 seconds less" onclick={() => nudge(-15_000)}>−15</button>
          <button type="button" class={restBtn} aria-label="15 seconds more" onclick={() => nudge(15_000)}>+15</button>
          <button type="button" class={restBtn} onclick={skip}>Skip</button>
        </div>
        <span class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground/10" aria-hidden="true">
          <span class="block h-full bg-foreground transition-[width] duration-200 motion-reduce:transition-none" style="width: {progress * 100}%"></span>
        </span>
      </div>
    {:else}
      <button
        type="button"
        class="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-muted text-[15px] font-medium transition-colors hover:bg-muted/80 disabled:opacity-50"
        {disabled}
        onclick={onAdd}
        data-testid="add-to-workout"
      >
        <Plus class="size-5" /> Add to workout
      </button>
      {#if musicAvailable}{@render musicButton("size-12 bg-muted")}{/if}
    {/if}
  </div>
</div>

{#snippet musicButton(cls: string)}
  <button type="button" class="flex shrink-0 items-center justify-center rounded-xl border border-input {cls}" aria-label="Music" onclick={() => musicBar?.openMusic()}>
    <Music class="size-5" />
  </button>
{/snippet}
