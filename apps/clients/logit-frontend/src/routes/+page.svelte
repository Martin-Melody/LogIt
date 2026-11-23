<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { SlidersHorizontal } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { homeConfig } from "$lib/stores/homeConfig.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
  import { autoTour } from "$lib/tour/index";
  import { pluginRuntime, type RuntimeWidgetDefinition } from "$lib/plugins";
  import { chartWidgets, insightCharts } from "$lib/features/insights/charts.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { connectionStatus } from "@logit/core/api/connectionStatus.svelte";
  import { popIn } from "$lib/transitions";
  import { getNutritionRepo, getHabitRepo } from "$lib/data/repoProvider";
  import ConnectionDot from "$lib/components/ConnectionDot.svelte";
  import FirstDownloadNotice from "$lib/sync/FirstDownloadNotice.svelte";
  import PendingCard from "$lib/sync/PendingCard.svelte";
  import { firstDownloadState } from "$lib/sync/firstDownload";
  import { firstDownloadAt, lastSyncFailed, planIncludesSync, syncRunning } from "$lib/sync/syncService";

  // Right after signing in the account's training is still downloading: say so, and keep
  // the cards that need it on placeholders instead of their empty states. Quick start works
  // throughout; the two that show nothing without data stay hidden.
  const firstDownload = $derived(
    firstDownloadState({
      signedIn: authStore.isAuthenticated,
      syncs: authStore.isAuthenticated && planIncludesSync(),
      downloadedAt: $firstDownloadAt,
      running: $syncRunning,
      failed: $lastSyncFailed,
    }),
  );
  const LIVE_WHILE_DOWNLOADING = new Set(["quick-start", "today"]);
  const HIDDEN_WHILE_DOWNLOADING = new Set(["this-week", "next-step"]);

  let baseWidgets = $state<RuntimeWidgetDefinition[]>(
    localWidgetRegistry.list().map((widget) => ({
      ...widget,
      source: "builtin" as const,
      pluginEnabled: true,
      bundleContract: null,
    })),
  );
  // Saved Insights charts can sit on the home screen too.
  const widgets = $derived([...baseWidgets, ...chartWidgets(insightCharts.list)]);

  const activeWidgets = $derived(
    [...$homeConfig.slots]
      .filter((s) => s.enabled)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => widgets.find((w) => w.id === s.id))
      .filter(
        (w): w is RuntimeWidgetDefinition => w !== undefined && w.pluginEnabled,
      ),
  );

  onMount(() => {
    void homeConfig.reconcilePlugins();
    void getNutritionRepo()
      .getGoal()
      .then((goal) => homeConfig.seedNutritionWidgets(goal != null))
      .catch(() => {});
    void getHabitRepo()
      .listHabits()
      .then((habits) => homeConfig.seedHabitsWidget(habits.length > 0))
      .catch(() => {});
    void pluginRuntime.listWidgets().then((loaded) => {
      baseWidgets = loaded;
    });
    void insightCharts.sync();

    if (authStore.isAuthenticated) connectionStatus.startPolling();

    // Small delay so widgets render before the tour tries to find them
    setTimeout(() => {
      if ($onboarding.completed) autoTour("app.home");
    }, 400);
  });

  onDestroy(() => connectionStatus.stopPolling());
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <PageHeader>
    <h1 class="page-title">Home</h1>
    <div class="flex items-center gap-2">
      {#if authStore.isAuthenticated}
        <ConnectionDot />
      {/if}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Customise home"
        data-guide="home-customize"
        onclick={() => void goto("/home/customize")}
      >
        <SlidersHorizontal class="h-4 w-4" />
      </Button>
    </div>
  </PageHeader>

  {#if firstDownload}
    <FirstDownloadNotice
      status={firstDownload}
      subject="training"
      detail="Sessions, splits and progress. You can start a workout meanwhile."
    />
  {/if}

  {#each activeWidgets as widget, i (widget.id)}
    {@const WidgetComponent = widget.component}
    {#if firstDownload && HIDDEN_WHILE_DOWNLOADING.has(widget.id)}
      <!-- Shows nothing until there's data. -->
    {:else if firstDownload && !LIVE_WHILE_DOWNLOADING.has(widget.id)}
      <PendingCard title={widget.label} status={firstDownload} />
    {:else}
      <div in:popIn={{ duration: 220, delay: Math.min(i * 40, 320) }} data-guide={widget.guideMark}>
        <WidgetComponent {...(widget.props ?? {})} />
      </div>
    {/if}
  {/each}
</div>
