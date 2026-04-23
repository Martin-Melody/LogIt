<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Pencil, Check, X, RotateCcw } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    getProgressionConfig,
    setProgressionAlgorithm,
  } from "$lib/usecases/progression/getProgressionConfig";
  import type { ProgressionConfigView } from "$lib/usecases/progression/getProgressionConfig";
  import { profile } from "$lib/stores/profile.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { resetTours, startHomeTour, startSessionTour, startSplitsTour } from "$lib/tour/index";

  const isDev = import.meta.env.DEV;

  // --- Progression ---
  const progUi = $state({ loading: true, saving: false, error: null as string | null });
  let view = $state<ProgressionConfigView>({ config: null, algorithms: [] });

  async function loadProgression() {
    progUi.loading = true;
    progUi.error = null;
    try {
      view = await getProgressionConfig();
    } catch (e) {
      progUi.error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      progUi.loading = false;
    }
  }

  async function selectAlgorithm(id: string) {
    if (progUi.saving) return;
    progUi.saving = true;
    progUi.error = null;
    try {
      await setProgressionAlgorithm(id);
      view = { ...view, config: id ? { algorithmId: id } : null };
    } catch (e) {
      progUi.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      progUi.saving = false;
    }
  }

  onMount(() => { void loadProgression(); });

  // --- Profile editing ---
  const editing = $state({ open: false });
  const draft = $state<{
    name: string;
    height: string | number;
    heightUnit: "cm" | "in";
    weight: string | number;
    weightUnit: "kg" | "lbs";
  }>({
    name: "",
    height: "",
    heightUnit: "cm",
    weight: "",
    weightUnit: "kg",
  });

  function openEdit() {
    draft.name = $profile.name;
    draft.height = $profile.height !== null ? String($profile.height) : "";
    draft.heightUnit = $profile.heightUnit;
    draft.weight = $profile.weight !== null ? String($profile.weight) : "";
    draft.weightUnit = $profile.weightUnit;
    editing.open = true;
  }

  function numOrNull(v: string | number): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function saveEdit() {
    profile.save({
      name: draft.name.trim(),
      height: numOrNull(draft.height),
      heightUnit: draft.heightUnit,
      weight: numOrNull(draft.weight),
      weightUnit: draft.weightUnit,
    });
    editing.open = false;
  }

  function formatHeight(h: number | null, unit: string) {
    if (h === null) return "—";
    return unit === "in" ? `${h} in` : `${h} cm`;
  }

  function formatWeight(w: number | null, unit: string) {
    if (w === null) return "—";
    return `${w} ${unit}`;
  }

  // --- Dev tools ---
  async function resetOnboarding() {
    resetTours();
    onboarding.reset();
    await goto("/onboarding");
  }
</script>

<div class="flex flex-col gap-3 p-3 pb-24">

  <!-- Profile -->
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>Profile</Card.Title>
      {#if !editing.open}
        <Card.Action>
          <button
            type="button"
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onclick={openEdit}
          >
            <Pencil class="h-3.5 w-3.5" /> Edit
          </button>
        </Card.Action>
      {/if}
    </Card.Header>

    <Card.Content>
      {#if editing.open}
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground" for="p-name">Name</label>
            <input
              id="p-name"
              type="text"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={draft.name}
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground" for="p-height">Height</label>
            <div class="flex gap-2">
              <input
                id="p-height"
                type="number"
                min="0"
                inputmode="decimal"
                class="flex-1 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                bind:value={draft.height}
              />
              <div class="flex overflow-hidden rounded border text-xs">
                <button type="button" class="px-3 py-2 {draft.heightUnit === 'cm' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.heightUnit = "cm")}>cm</button>
                <button type="button" class="px-3 py-2 {draft.heightUnit === 'in' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.heightUnit = "in")}>in</button>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground" for="p-weight">Weight</label>
            <div class="flex gap-2">
              <input
                id="p-weight"
                type="number"
                min="0"
                inputmode="decimal"
                class="flex-1 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                bind:value={draft.weight}
              />
              <div class="flex overflow-hidden rounded border text-xs">
                <button type="button" class="px-3 py-2 {draft.weightUnit === 'kg' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.weightUnit = "kg")}>kg</button>
                <button type="button" class="px-3 py-2 {draft.weightUnit === 'lbs' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.weightUnit = "lbs")}>lbs</button>
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <Button size="sm" onclick={saveEdit}><Check class="mr-1 h-3.5 w-3.5" /> Save</Button>
            <Button size="sm" variant="outline" onclick={() => (editing.open = false)}><X class="mr-1 h-3.5 w-3.5" /> Cancel</Button>
          </div>
        </div>
      {:else}
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted-foreground">Name</dt>
          <dd>{$profile.name || "—"}</dd>
          <dt class="text-muted-foreground">Height</dt>
          <dd>{formatHeight($profile.height, $profile.heightUnit)}</dd>
          <dt class="text-muted-foreground">Weight</dt>
          <dd>{formatWeight($profile.weight, $profile.weightUnit)}</dd>
        </dl>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Progression algorithm -->
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>Progression</Card.Title>
      <Card.Description>
        Choose how the app suggests weights and reps for your next session.
        Each exercise tracks its own history independently.
      </Card.Description>
    </Card.Header>

    <Card.Content class="flex flex-col gap-3">
      {#if progUi.error}
        <p class="text-sm text-destructive">{progUi.error}</p>
      {/if}

      {#if progUi.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if view.algorithms.length === 0}
        <p class="text-sm text-muted-foreground">No algorithms available.</p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each view.algorithms as algo (algo.id)}
            {@const isActive = view.config?.algorithmId === algo.id}
            <li class="rounded border p-3 transition-colors {isActive ? 'border-primary bg-primary/5' : 'border-border'}">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">{algo.name}</p>
                    {#if isActive}
                      <span class="text-xs font-medium text-primary rounded border border-primary px-1.5 py-0.5">Active</span>
                    {/if}
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">{algo.description}</p>
                  {#if algo.author}
                    <p class="mt-1 text-xs text-muted-foreground/60">by {algo.author}</p>
                  {/if}
                </div>
                {#if !isActive}
                  <Button size="sm" variant="outline" disabled={progUi.saving} onclick={() => void selectAlgorithm(algo.id)}>Select</Button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>

        {#if view.config}
          <Button variant="ghost" class="text-muted-foreground text-sm self-start" disabled={progUi.saving} onclick={() => void selectAlgorithm("")}>
            Disable suggestions
          </Button>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Tour help -->
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>App Tour</Card.Title>
      <Card.Description>Replay a walkthrough for any part of the app.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-2">
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startHomeTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Home overview
      </Button>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startSplitsTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Training splits
      </Button>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startSessionTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Workout session
      </Button>
    </Card.Content>
  </Card.Root>

  <!-- Dev tools — only visible in development builds -->
  {#if isDev}
    <Card.Root class="w-full border-destructive/40">
      <Card.Header>
        <Card.Title class="text-destructive">Developer</Card.Title>
        <Card.Description>Reset app state for testing.</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-2">
        <Button variant="outline" size="sm" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10" onclick={() => void resetOnboarding()}>
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Reset onboarding
        </Button>
        <Button variant="outline" size="sm" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10" onclick={() => resetTours()}>
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Reset tours
        </Button>
      </Card.Content>
    </Card.Root>
  {/if}

</div>
