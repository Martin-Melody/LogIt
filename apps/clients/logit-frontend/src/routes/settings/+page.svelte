<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, RotateCcw, Sparkles } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import {
    resetTours,
    startHomeTour,
    startSessionTour,
    startSplitsTour,
    startExercisesTour,
    startProfileTour,
  } from "$lib/tour/index";
  import { clearAllData } from "$lib/usecases/clearAllData";
  import { setMode, userPrefersMode } from "mode-watcher";
  import ImportExportPanel from "$lib/features/importExport/ImportExportPanel.svelte";
  import {
    getProgressionConfig,
    setProgressionAlgorithm,
  } from "$lib/usecases/progression/getProgressionConfig";
  import type { ProgressionConfigView } from "$lib/usecases/progression/getProgressionConfig";
  import {
    getAnalyticsConfig,
    setAnalyticsPlugin,
    DEFAULT_ANALYTICS_ID,
  } from "$lib/usecases/progression/getAnalyticsConfig";
  import type { AnalyticsConfigView } from "$lib/usecases/progression/getAnalyticsConfig";

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

  // --- Analytics ---
  const analyticsUi = $state({ loading: true, saving: false, error: null as string | null });
  let analyticsView = $state<AnalyticsConfigView>({ config: null, plugins: [] });

  async function loadAnalytics() {
    analyticsUi.loading = true;
    analyticsUi.error = null;
    try {
      analyticsView = await getAnalyticsConfig();
    } catch (e) {
      analyticsUi.error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      analyticsUi.loading = false;
    }
  }

  async function selectAnalyticsPlugin(id: string) {
    if (analyticsUi.saving) return;
    analyticsUi.saving = true;
    analyticsUi.error = null;
    try {
      await setAnalyticsPlugin(id);
      analyticsView = { ...analyticsView, config: id ? { analyticsId: id } : null };
    } catch (e) {
      analyticsUi.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      analyticsUi.saving = false;
    }
  }

  // --- Session preferences ---
  const SET_TYPE_LABELS: Record<string, string> = {
    normal: "Normal",
    warmup: "Warm-up",
    dropset: "Drop set",
    amrap: "AMRAP",
    failure: "To failure",
  };

  function toggleRestDefault(type: string) {
    const current = $profile.restDefaults[type];
    profile.save({
      restDefaults: {
        ...$profile.restDefaults,
        [type]: current !== undefined ? undefined : 90_000,
      },
    });
  }

  function setRestSeconds(type: string, seconds: string) {
    const ms = Math.round(Number(seconds) * 1000);
    if (!Number.isFinite(ms) || ms <= 0) return;
    profile.save({ restDefaults: { ...$profile.restDefaults, [type]: ms } });
  }

  async function resetOnboarding() {
    resetTours();
    onboarding.reset();
    await goto("/onboarding");
  }

  onMount(() => {
    void loadProgression();
    void loadAnalytics();
  });
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => back("/profile")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-base font-semibold">Settings</h1>
  </div>

  <!-- Appearance -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Appearance</Card.Title>
      <Card.Description>Choose how the app looks.</Card.Description>
    </Card.Header>
    <Card.Content>
      <div class="flex rounded border overflow-hidden text-sm w-fit">
        {#each ([ ["system", "System"], ["light", "Light"], ["dark", "Dark"] ] as ["system"|"light"|"dark", string][]) as [value, label] (value)}
          <button
            type="button"
            class="px-4 py-2 transition-colors {userPrefersMode.current === value ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
            onclick={() => setMode(value)}
          >
            {label}
          </button>
        {/each}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Progression -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Progression</Card.Title>
      <Card.Description>How the app suggests weights and reps for your next session.</Card.Description>
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

  <!-- Analytics -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Analytics</Card.Title>
      <Card.Description>How the app computes your progress metrics and chart data.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      {#if analyticsUi.error}
        <p class="text-sm text-destructive">{analyticsUi.error}</p>
      {/if}
      {#if analyticsUi.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if analyticsView.plugins.length === 0}
        <p class="text-sm text-muted-foreground">No analytics plugins available.</p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each analyticsView.plugins as plugin (plugin.id)}
            {@const activeId = analyticsView.config?.analyticsId ?? DEFAULT_ANALYTICS_ID}
            {@const isActive = activeId === plugin.id}
            <li class="rounded border p-3 transition-colors {isActive ? 'border-primary bg-primary/5' : 'border-border'}">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">{plugin.name}</p>
                    {#if isActive}
                      <span class="text-xs font-medium text-primary rounded border border-primary px-1.5 py-0.5">Active</span>
                    {/if}
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">{plugin.description}</p>
                  {#if plugin.author}
                    <p class="mt-1 text-xs text-muted-foreground/60">by {plugin.author}</p>
                  {/if}
                </div>
                {#if !isActive}
                  <Button size="sm" variant="outline" disabled={analyticsUi.saving} onclick={() => void selectAnalyticsPlugin(plugin.id)}>Select</Button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Session -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Session</Card.Title>
      <Card.Description>Behaviour during a workout.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      <label class="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <p class="text-sm font-medium">Collapse blocks by default</p>
          <p class="text-xs text-muted-foreground">Exercise blocks start collapsed in a session.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={$profile.blocksCollapsedByDefault}
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {$profile.blocksCollapsedByDefault ? 'bg-primary' : 'bg-input'}"
          onclick={() => profile.save({ blocksCollapsedByDefault: !$profile.blocksCollapsedByDefault })}
        >
          <span class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform {$profile.blocksCollapsedByDefault ? 'translate-x-4' : 'translate-x-0'}"></span>
        </button>
      </label>

      <div class="flex flex-col gap-2">
        <p class="text-sm font-medium">Auto rest timer</p>
        <p class="text-xs text-muted-foreground mb-1">Enable and set the default rest duration for each set type.</p>
        {#each Object.keys(SET_TYPE_LABELS) as type (type)}
          {@const enabled = $profile.restDefaults[type] !== undefined}
          {@const seconds = enabled ? Math.round(($profile.restDefaults[type] ?? 90_000) / 1000) : 90}
          <div class="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {enabled ? 'bg-primary' : 'bg-input'}"
              onclick={() => toggleRestDefault(type)}
            >
              <span class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform {enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
            <span class="text-sm w-24">{SET_TYPE_LABELS[type]}</span>
            {#if enabled}
              <div class="flex items-center gap-1.5 ml-auto">
                <input
                  type="number"
                  min="5"
                  max="600"
                  class="w-16 rounded border bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  value={seconds}
                  onchange={(e) => setRestSeconds(type, (e.target as HTMLInputElement).value)}
                />
                <span class="text-xs text-muted-foreground">sec</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Backup & Restore -->
  <ImportExportPanel />

  <!-- App Tour -->
  <Card.Root>
    <Card.Header>
      <Card.Title>App Tour</Card.Title>
      <Card.Description>Replay a walkthrough for any part of the app.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-2">
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startHomeTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Home overview
      </Button>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startSessionTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Workout session
      </Button>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startSplitsTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Training splits
      </Button>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startExercisesTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Exercise library
      </Button>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => startProfileTour(true)}>
        <RotateCcw class="h-3.5 w-3.5 mr-2" /> Profile page
      </Button>
    </Card.Content>
  </Card.Root>

  <!-- Plugins -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Plugins</Card.Title>
      <Card.Description>Explore community-built widgets and algorithms.</Card.Description>
    </Card.Header>
    <Card.Content>
      <Button variant="outline" size="sm" class="justify-start" onclick={() => void goto("/plugins")}>
        <Sparkles class="mr-2 h-3.5 w-3.5" /> Open plugin catalog
      </Button>
    </Card.Content>
  </Card.Root>

  <!-- Dev tools -->
  {#if isDev}
    <Card.Root class="border-destructive/40">
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
        <Button variant="outline" size="sm" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10" onclick={() => void clearAllData()}>
          <RotateCcw class="h-3.5 w-3.5 mr-2" /> Clear all data & databases
        </Button>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
