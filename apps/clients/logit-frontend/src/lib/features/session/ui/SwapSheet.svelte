<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ChevronRight, Plus, Search } from "lucide-svelte";
  import type { Exercise } from "@logit/core/domain/exercise";
  import type { StrengthBlockData } from "@logit/core/domain/workout";
  import { loadLibrary } from "$lib/data/library/library";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { profile } from "$lib/stores/profile.store";
  import { setsLine } from "$lib/features/session/planFormat";

  // Swap an exercise (design canvas S-swap): exercises for the same muscles first, with what
  // you did last time; "Just today" or "Change the plan too" (the split day it came from).
  const {
    open,
    onOpenChange,
    exerciseName,
    exerciseId,
    doneCount = 0,
    totalCount = 0,
    canChangePlan = false,
    onPick,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    exerciseName: string;
    exerciseId?: string;
    doneCount?: number;
    totalCount?: number;
    /** The workout came from a split day, so the plan can change too. */
    canChangePlan?: boolean;
    onPick: (selection: { name: string; exerciseId?: string }, changePlan: boolean) => void | Promise<void>;
  } = $props();

  let query = $state("");
  let changePlan = $state(false);
  let library = $state<Exercise[]>([]);
  let lastTimes = $state(new Map<string, string>());

  $effect(() => {
    if (!open) {
      query = "";
      changePlan = false;
      return;
    }
    void loadLibrary("strength").then((e) => (library = e.map((x) => x.item as Exercise))).catch(() => (library = []));
    void getWorkoutRepo().listRecentSessions({ limit: 30 }).then((sessions) => {
      const out = new Map<string, string>();
      for (const s of sessions) for (const b of s.blocks) {
        if (b.type !== "strength") continue;
        const d = b.data as StrengthBlockData;
        const key = d.exerciseId ?? d.exerciseName.toLowerCase();
        if (out.has(key)) continue;
        const done = d.sets.filter((x) => x.completed && x.setType !== "warmup" && x.reps > 0);
        if (done.length) out.set(key, `Last time ${setsLine(done, $profile.weightUnit)}`);
      }
      lastTimes = out;
    }).catch(() => {});
  });

  const current = $derived(library.find((e) => e.id === exerciseId || e.name.toLowerCase() === exerciseName.toLowerCase()));
  const muscle = $derived(current?.primaryMuscles?.[0] ?? null);
  const q = $derived(query.trim().toLowerCase());
  const others = $derived(library.filter((e) => e.id !== current?.id && e.name.toLowerCase() !== exerciseName.toLowerCase()));
  const sameMuscles = $derived(
    muscle
      ? others
          .filter((e) => e.primaryMuscles?.includes(muscle))
          .sort((a, b) => Number(lastTimes.has(b.id)) - Number(lastTimes.has(a.id)))
          .slice(0, 12)
      : [],
  );
  const results = $derived(q ? others.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 30) : []);
  const shown = $derived(q ? results : sameMuscles);
  const subtitle = $derived(
    doneCount > 0 && doneCount < totalCount
      ? `The ${doneCount === 1 ? "set" : `${doneCount} sets`} done stay as ${exerciseName}. The rest move over.`
      : doneCount > 0 ? `The sets done stay as ${exerciseName}.` : "Your plan moves over to the new exercise.",
  );

  async function pick(sel: { name: string; exerciseId?: string }) {
    onOpenChange(false);
    await onPick(sel, changePlan);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="top-24 flex max-h-none flex-col gap-3 bg-card" onOpenAutoFocus={(e) => e.preventDefault()}>
    <div class="flex flex-col gap-0.5 pr-8">
      <Dialog.Title class="text-[19px] font-semibold">Instead of {exerciseName}</Dialog.Title>
      <Dialog.Description class="text-[13px]">{subtitle}</Dialog.Description>
    </div>
    <label class="flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
      <Search class="h-4 w-4 shrink-0" />
      <input bind:value={query} type="search" placeholder="Search exercises" aria-label="Search exercises"
        class="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none" />
    </label>
    {#if canChangePlan}
      <div class={segmentTrack} role="group" aria-label="How long">
        <button type="button" class={segment(!changePlan)} aria-pressed={!changePlan} onclick={() => (changePlan = false)}>Just today</button>
        <button type="button" class={segment(changePlan)} aria-pressed={changePlan} onclick={() => (changePlan = true)}>Change the plan too</button>
      </div>
    {/if}

    <div class="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      {#if !q && sameMuscles.length}
        <h3 class="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Same muscles</h3>
      {/if}
      <div class="flex flex-col">
        {#each shown as e (e.id)}
          <button type="button" class="flex min-h-[60px] w-full items-center gap-3 border-t border-border px-1 text-left first:border-t-0" onclick={() => void pick({ name: e.name, exerciseId: e.id })}>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[15px]">{e.name}</span>
              <span class="truncate text-xs text-muted-foreground tabular-nums">{lastTimes.get(e.id) ?? ([e.primaryMuscles?.[0], e.equipment].filter(Boolean).join(" · ") || "Never done · LogIt picks a start weight")}</span>
            </span>
            <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        {/each}
        {#if q && !results.some((e) => e.name.toLowerCase() === q)}
          <button type="button" class="flex min-h-14 w-full items-center gap-3 border-t border-border px-1 text-left" onclick={() => void pick({ name: query.trim() })}>
            <Plus class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate text-[15px]">Use “{query.trim()}”, a new exercise</span>
          </button>
        {/if}
        {#if !q && !sameMuscles.length}
          <p class="py-6 text-center text-sm text-muted-foreground">Search for the exercise to do instead.</p>
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
