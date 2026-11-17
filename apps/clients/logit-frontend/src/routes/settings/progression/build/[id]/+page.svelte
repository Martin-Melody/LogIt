<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Share2, X } from "lucide-svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import ShareRecipeSheet from "$lib/features/progression/ShareRecipeSheet.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { back } from "$lib/navigation";
  import { toast } from "$lib/components/ui/sonner";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { pushExerciseSetting, pushProgressionRecipe } from "$lib/sync/syncService";
  import { bumpProgression } from "$lib/progression/store";
  import { getExercises } from "@logit/core/domain/workout";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import { createProgressionRecipe, recipeAlgorithmId, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";
  import {
    deleteProgressionRecipe,
    getProgressionRecipe,
    previewProgressionRecipe,
    saveProgressionRecipe,
  } from "@logit/core/usecases/progression/progressionRecipes";

  // Build a progression algorithm from blocks, no code. The preview runs it on your own
  // history for one exercise every time a block changes.
  const id = $derived(page.params.id ?? "new");
  let recipe = $state<ProgressionRecipe>(createProgressionRecipe());
  let isNew = $state(true);
  let loading = $state(true);
  let saving = $state(false);
  let confirmDelete = $state(false);
  let sharing = $state<ProgressionRecipe | null>(null);
  let posting = $state(false);

  let exercises = $state<{ id?: string; name: string }[]>([]);
  let previewFor = $state(0);
  let preview = $state<ProgressionOutput | null>(null);
  let previewing = $state(false);

  onMount(() => void load());

  async function load() {
    if (id !== "new") {
      const existing = await getProgressionRecipe(id, getProgressionDeps());
      if (existing) {
        recipe = existing;
        isNew = false;
      }
    }
    // The exercises you've done most recently, to preview on.
    const sessions = await getWorkoutRepo().listRecentSessions({ limit: 15 }).catch(() => []);
    const seen = new Map<string, { id?: string; name: string }>();
    for (const s of sessions) {
      for (const e of getExercises(s)) {
        if (!e.sets.some((x) => x.weight > 0)) continue;
        const key = e.exerciseId ?? e.exerciseName.toLowerCase();
        if (!seen.has(key)) seen.set(key, { id: e.exerciseId, name: e.exerciseName });
      }
    }
    exercises = [...seen.values()].slice(0, 8);
    loading = false;
  }

  // Re-run the preview whenever the recipe or the chosen exercise changes.
  let run = 0;
  $effect(() => {
    const ex = exercises[previewFor];
    const snapshot = $state.snapshot(recipe) as ProgressionRecipe;
    if (!ex) return;
    const mine = ++run;
    previewing = true;
    void previewProgressionRecipe(snapshot, ex, getProgressionDeps())
      .then((out) => {
        if (mine === run) preview = out;
      })
      .catch(() => {
        if (mine === run) preview = null;
      })
      .finally(() => {
        if (mine === run) previewing = false;
      });
  });

  async function persist(): Promise<ProgressionRecipe> {
    const row = await saveProgressionRecipe({ ...$state.snapshot(recipe), name: recipe.name.trim() || "My algorithm" } as ProgressionRecipe, getProgressionDeps());
    pushProgressionRecipe(row);
    bumpProgression();
    return row;
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const row = await persist();
      toast(isNew ? `Saved ${row.name}. Pick it in Progression, or on any exercise.` : `Saved ${row.name}`);
      back("/settings#sec-progression");
    } finally {
      saving = false;
    }
  }

  // Sharing saves first, so what's shared is what's on screen.
  async function share() {
    if (saving) return;
    saving = true;
    try {
      const row = await persist();
      recipe = row;
      sharing = row;
    } finally {
      saving = false;
    }
  }

  async function remove() {
    confirmDelete = false;
    const { tombstone, exercises: changed } = await deleteProgressionRecipe(recipe.id, getProgressionDeps());
    if (tombstone) pushProgressionRecipe(tombstone);
    for (const s of changed) pushExerciseSetting(s);
    bumpProgression();
    toast(`Deleted ${recipe.name}`);
    await goto("/settings#sec-progression");
  }

  type Opt<T> = { value: T; label: string };
  const WEIGHT_FROM: Opt<ProgressionRecipe["weightFrom"]>[] = [
    { value: "estimate", label: "Strength estimate" },
    { value: "last", label: "Last session's sets" },
    { value: "wave", label: "Weekly wave (5/3/1)" },
  ];
  const RANGES: Opt<string>[] = [
    { value: "", label: "Default" },
    { value: "3-6", label: "3–6" },
    { value: "5-8", label: "5–8" },
    { value: "8-12", label: "8–12" },
    { value: "12-20", label: "12–20" },
  ];
  const EFFORT: Opt<number>[] = [
    { value: 0, label: "Close to failure" },
    { value: 1, label: "1 left" },
    { value: 2, label: "2 left" },
    { value: 3, label: "3 left" },
  ];
  const LAYOUT: Opt<ProgressionRecipe["setLayout"]>[] = [
    { value: "straight", label: "Same weight" },
    { value: "topBackoff", label: "Top set + back-offs" },
    { value: "dropWeight", label: "Same reps, drop weight" },
  ];
  const STALL: Opt<ProgressionRecipe["whenStalled"]>[] = [
    { value: "deload", label: "Deload 10%" },
    { value: "hold", label: "Hold and tell me" },
  ];
  const STEPS: Opt<number>[] = [1, 1.25, 2.5, 5].map((v) => ({ value: v, label: `${v} kg` }));
  const SETS: Opt<number>[] = [2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));

  const rangeValue = $derived(recipe.repRange ? `${recipe.repRange[0]}-${recipe.repRange[1]}` : "");
  function setRange(v: string) {
    if (!v) {
      const { repRange: _drop, ...rest } = recipe;
      void _drop;
      recipe = rest as ProgressionRecipe;
    } else {
      const [a, b] = v.split("-").map(Number);
      recipe.repRange = [a!, b!];
    }
  }

  const hints = $derived({
    weightFrom:
      recipe.weightFrom === "estimate"
        ? "From your best recent sets, so one off day or light back-off sets don't hold it back. Beat the reps and the weight follows."
        : recipe.weightFrom === "last"
          ? "Each set aims for one more rep than last time, and the weight goes up once every set hits the top of the range."
          : "A training max at 90% of your strength estimate: weeks of 5s, 3s and 5/3/1 with the last set as many as you can, then a light week. The max goes up each cycle.",
    range: "Default is 5–8 for big lifts and 8–12 for single-muscle ones. An exercise's own rep range, or a split day's reps, still win.",
  });

  const chip = (on: boolean) =>
    `min-h-10 rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-transparent bg-foreground text-background" : "border-border"}`;
  const setsText = (out: ProgressionOutput) =>
    out.sets.map((s) => `${Math.round(s.weight * 100) / 100} kg × ${Array.isArray(s.reps) ? `${s.reps[0]}–${s.reps[1]}` : s.reps}${s.setType === "amrap" ? "+" : ""}`);
</script>

{#snippet block(n: number, title: string, hint: string | null, options: Opt<unknown>[], current: unknown, pick: (v: never) => void)}
  <div class="flex flex-col gap-2.5 border-t border-border px-4 py-3.5 first:border-t-0">
    <div class="flex items-baseline gap-2">
      <span class="w-4 text-[11px] font-semibold text-muted-foreground tabular-nums">{n}</span>
      <span class="text-sm font-semibold">{title}</span>
    </div>
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label={title}>
      {#each options as o (String(o.value))}
        <button type="button" role="radio" aria-checked={o.value === current} class={chip(o.value === current)} onclick={() => pick(o.value as never)}>
          {o.label}
        </button>
      {/each}
    </div>
    {#if hint}<p class="text-xs leading-relaxed text-muted-foreground">{hint}</p>{/if}
  </div>
{/snippet}

<PageHeader>
  <button type="button" class="flex size-11 items-center justify-center rounded-lg" aria-label="Close" onclick={() => back("/settings#sec-progression")}>
    <X class="size-[22px]" />
  </button>
  <h1 class="page-title flex-1">{isNew ? "New algorithm" : "Edit algorithm"}</h1>
  {#if !isNew}
    <button type="button" class="flex size-11 items-center justify-center rounded-lg disabled:opacity-50" aria-label="Share" disabled={saving || loading} onclick={() => void share()}>
      <Share2 class="size-5" />
    </button>
  {/if}
  <button type="button" class="mr-1 h-10 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50" disabled={saving || loading} onclick={() => void save()}>
    Save
  </button>
</PageHeader>

{#if loading}
  <p class="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
{:else}
  <div class="flex flex-col gap-4 px-3 pb-12 pt-2">
    <label class="flex flex-col gap-1.5">
      <span class="px-1 text-xs font-medium text-muted-foreground">Name</span>
      <input class="h-12 rounded-xl bg-muted px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-ring" bind:value={recipe.name} />
    </label>

    <!-- Live preview on real history -->
    <section class="flex flex-col gap-2 rounded-2xl bg-primary/10 p-4" aria-labelledby="preview-title" aria-live="polite" data-testid="recipe-preview">
      <div class="flex items-baseline gap-2">
        <h2 id="preview-title" class="flex-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Your next {exercises[previewFor]?.name ?? "session"}
        </h2>
        {#if previewing}<span class="text-xs text-muted-foreground">…</span>{/if}
      </div>
      {#if exercises.length > 1}
        <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Preview on">
          {#each exercises as e, i (e.id ?? e.name)}
            <button type="button" role="radio" aria-checked={i === previewFor} class="{chip(i === previewFor)} min-h-8 px-2.5 text-xs" onclick={() => (previewFor = i)}>{e.name}</button>
          {/each}
        </div>
      {/if}
      {#if exercises.length === 0}
        <p class="text-sm text-muted-foreground">Log a workout and the preview shows what this plans for it.</p>
      {:else if preview && preview.sets.length > 0}
        <ol class="flex flex-col gap-1">
          {#each setsText(preview) as line, i (i)}
            <li class="flex gap-3 text-[15px]"><span class="w-11 text-xs text-muted-foreground tabular-nums">Set {i + 1}</span><span class="font-semibold tabular-nums">{line}</span></li>
          {/each}
        </ol>
        {#if preview.reasoning?.summary?.length}
          <ul class="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
            {#each preview.reasoning.summary as l (l)}<li>{l}</li>{/each}
          </ul>
        {/if}
      {:else if preview?.change?.detail}
        <p class="text-sm text-muted-foreground">{preview.change.detail}</p>
      {/if}
    </section>

    <div class="overflow-hidden rounded-2xl bg-card">
      {@render block(1, "How the weight is picked", hints.weightFrom, WEIGHT_FROM, recipe.weightFrom, (v: ProgressionRecipe["weightFrom"]) => (recipe.weightFrom = v))}
      {#if recipe.weightFrom !== "wave"}
        {@render block(2, "Rep range", hints.range, RANGES, rangeValue, (v: string) => setRange(v))}
      {/if}
      {#if recipe.weightFrom === "estimate"}
        {@render block(3, "How hard", "Reps left in the tank on each set.", EFFORT, recipe.repsInReserve, (v: number) => (recipe.repsInReserve = v))}
        {@render block(4, "Set layout", null, LAYOUT, recipe.setLayout, (v: ProgressionRecipe["setLayout"]) => (recipe.setLayout = v))}
      {:else}
        {@render block(3, "When it stalls", recipe.weightFrom === "wave" ? "When the last set falls short of its reps." : "After two sessions under the range.", STALL, recipe.whenStalled, (v: ProgressionRecipe["whenStalled"]) => (recipe.whenStalled = v))}
      {/if}
      {@render block(5, "Working sets", "When the split day doesn't say.", SETS, recipe.sets.count, (v: number) => (recipe.sets = { ...recipe.sets, count: v }))}
      {@render block(6, "Weekly sets", "Adjust: one more set when the muscle is behind its weekly target, one fewer when it's over.", [{ value: "fixed", label: "Keep it fixed" }, { value: "weekly", label: "Adjust to weekly targets" }], recipe.sets.mode, (v: "fixed" | "weekly") => (recipe.sets = { ...recipe.sets, mode: v }))}
      {@render block(7, "Smallest weight step", "An exercise's machine still wins.", STEPS, recipe.increment, (v: number) => (recipe.increment = v))}
      {@render block(8, "Food", "Only on weeks you log food: under maintenance, the weight holds instead of going up.", [{ value: "ignore", label: "Ignore" }, { value: "diary", label: "Hold in a calorie deficit" }], recipe.food, (v: "ignore" | "diary") => (recipe.food = v))}
    </div>

    <p class="px-1 text-xs leading-relaxed text-muted-foreground">
      Once saved, pick it under Settings › Progression for every exercise, or on one exercise from its How it progresses. Need
      something these blocks can't do? Write it as a plugin on the web dashboard.
    </p>

    {#if !isNew}
      <button type="button" class="h-11 self-start px-1 text-sm font-medium text-destructive" onclick={() => (confirmDelete = true)}>Delete this algorithm</button>
    {/if}
  </div>
{/if}

<ConfirmDialog
  open={confirmDelete}
  onOpenChange={(v) => (confirmDelete = v)}
  title="Delete {recipe.name}?"
  description="Exercises using it go back to your general algorithm."
  confirmLabel="Delete"
  onConfirm={() => void remove()}
/>

{#if sharing}
  <ShareRecipeSheet
    recipe={sharing}
    canPost={authStore.isAuthenticated}
    onpost={() => {
      sharing = null;
      posting = true;
    }}
    onclose={() => (sharing = null)}
  />
{/if}

<CreatePostSheet
  open={posting}
  prefillAlgorithmId={recipeAlgorithmId(recipe.id)}
  onclose={() => (posting = false)}
  onposted={() => toast("Posted")}
/>
