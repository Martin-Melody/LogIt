<script lang="ts">
  import { page } from "$app/state";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ExerciseProgressionPanel from "$lib/features/exercise/components/ExerciseProgressionPanel.svelte";
  import ExerciseComparisonChart from "$lib/features/exercise/components/ExerciseComparisonChart.svelte";
  import ProgressStatusChip from "$lib/features/exercise/components/ProgressStatusChip.svelte";
  import Sparkline from "$lib/features/exercise/components/Sparkline.svelte";
  import MuscleGroupInsightsPanel from "$lib/features/exercise/components/MuscleGroupInsightsPanel.svelte";
  import NutritionCorrelationPanel from "$lib/features/exercise/components/NutritionCorrelationPanel.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { getAllExerciseProgressStories } from "@logit/core/usecases/progression/getAllExerciseProgressStories";
  import type { ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import { PROGRESS_STATUS_ATTENTION_ORDER, type ProgressStatus } from "@logit/core/domain/progression";
  import { getWebDeps } from "$lib/deps";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { reveal, popIn } from "$lib/transitions";
  import { fade } from "svelte/transition";

  const MAX_COMPARE = 5;

  let loading = $state(true);
  let error = $state<string | null>(null);
  let stories = $state<ExerciseProgressStory[]>([]);
  let selected = $state<string | null>(null);
  let compareMode = $state(false);
  let compareSet = $state<Set<string>>(new Set());

  // A plateau next-step links here with ?tab=muscles or ?tab=nutrition — open
  // the right tab directly rather than dropping the user on the exercise list.
  const initialTab = page.url.searchParams.get("tab");
  let tab = $state(initialTab === "muscles" || initialTab === "nutrition" ? initialTab : "exercises");

  const selectedStory = $derived(stories.find((s) => s.exerciseName === selected) ?? null);

  const STATUS_RANK: Record<ProgressStatus, number> = Object.fromEntries(
    PROGRESS_STATUS_ATTENTION_ORDER.map((s, i) => [s, i]),
  ) as Record<ProgressStatus, number>;

  const rows = $derived.by<ExerciseProgressStory[]>(() =>
    [...stories].sort(
      (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.lastTrainedMs - a.lastTrainedMs,
    ),
  );

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function toggleCompareMode() {
    compareMode = !compareMode;
    compareSet = new Set();
  }

  function toggleCompare(name: string) {
    const next = new Set(compareSet);
    if (next.has(name)) next.delete(name);
    else if (next.size < MAX_COMPARE) next.add(name);
    compareSet = next;
  }

  const compareExercises = $derived(
    rows.filter((r) => compareSet.has(r.exerciseName)).map((r) => ({ id: r.exerciseId, name: r.exerciseName })),
  );

  async function load(clientId: string | null) {
    loading = true;
    error = null;
    selected = null;
    try {
      stories = await getAllExerciseProgressStories(getWebDeps(clientId ?? undefined));
      if (stories.length > 0) selected = rows[0]?.exerciseName ?? stories[0]!.exerciseName;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load progress";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(viewingClient.id);
  });
</script>

<div class="flex flex-col gap-4">
  <h1 class="text-lg font-semibold">Progress</h1>

  {#if error}
    <Alert.Root variant="destructive">
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if loading}
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Skeleton class="h-96 xl:col-span-2" />
      <Skeleton class="h-96" />
    </div>
  {:else if stories.length === 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>No progress data yet</Card.Title>
        <Card.Description>
          Complete at least 2 sessions with the same exercise to see your progress here.
        </Card.Description>
      </Card.Header>
    </Card.Root>
  {:else}
    <div in:fade={{ duration: 160 }}>
    <Tabs.Root bind:value={tab} class="gap-3">
      <Tabs.List>
        <Tabs.Trigger value="exercises">Exercises</Tabs.Trigger>
        <Tabs.Trigger value="muscles">Muscle groups</Tabs.Trigger>
        <Tabs.Trigger value="nutrition">Nutrition</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="exercises">
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card.Root class="xl:col-span-1 p-0">
            <div class="flex items-center justify-between px-3 pt-3">
              <p class="text-xs text-muted-foreground">
                {#if compareMode}Select up to {MAX_COMPARE} to compare{:else}&nbsp;{/if}
              </p>
              <Button variant={compareMode ? "secondary" : "outline"} size="sm" onclick={toggleCompareMode}>
                {compareMode ? "Done" : "Compare"}
              </Button>
            </div>
            <div class="overflow-x-auto">
              <Table.Root class="text-sm">
                <Table.Header>
                  <Table.Row class="text-xs text-muted-foreground">
                    {#if compareMode}<Table.Head class="w-8"></Table.Head>{/if}
                    <Table.Head>Exercise</Table.Head>
                    <Table.Head></Table.Head>
                    <Table.Head class="text-right">Trend</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each rows as ex, i (ex.exerciseName)}
                    {@const delay = Math.min(i * 30, 240)}
                    <Table.Row
                      class="cursor-pointer hover:bg-muted/40 {!compareMode && selected === ex.exerciseName ? 'bg-muted/60' : ''}"
                      onclick={() => (compareMode ? toggleCompare(ex.exerciseName) : (selected = ex.exerciseName))}
                    >
                      {#if compareMode}
                        <Table.Cell>
                          <div in:popIn={{ duration: 200, delay }}>
                            <Checkbox checked={compareSet.has(ex.exerciseName)} onclick={(e) => e.stopPropagation()} onCheckedChange={() => toggleCompare(ex.exerciseName)} />
                          </div>
                        </Table.Cell>
                      {/if}
                      <Table.Cell>
                        <div in:popIn={{ duration: 200, delay }}>
                          <p class="font-medium truncate max-w-40">{ex.exerciseName}</p>
                          <div class="flex items-center gap-2 mt-1">
                            <ProgressStatusChip status={ex.status} />
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell class="text-xs text-muted-foreground whitespace-nowrap">
                        <div in:popIn={{ duration: 200, delay }}>{formatDate(ex.lastTrainedMs)}</div>
                      </Table.Cell>
                      <Table.Cell class="text-right">
                        <div class="flex items-center justify-end gap-2" in:popIn={{ duration: 200, delay }}>
                          <Sparkline values={ex.spark} class="shrink-0" />
                          <span class="font-semibold tabular-nums shrink-0 w-14 text-right">{ex.headline.value}</span>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          </Card.Root>

          <Card.Root class="xl:col-span-2">
            {#if compareMode}
              <div in:reveal>
                <Card.Header class="pb-2">
                  <Card.Title>Compare</Card.Title>
                  <Card.Description>
                    {compareSet.size < 2 ? "Select at least 2 exercises to overlay their progression." : `${compareSet.size} exercises selected`}
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  {#if compareSet.size >= 2}
                    <ExerciseComparisonChart exercises={compareExercises} clientId={viewingClient.id ?? undefined} />
                  {/if}
                </Card.Content>
              </div>
            {:else if selectedStory}
              {#key selected}
                <div in:reveal>
                  <Card.Header class="pb-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <Card.Title class="truncate">{selectedStory.exerciseName}</Card.Title>
                        <Card.Description>Last trained {formatDate(selectedStory.lastTrainedMs)}</Card.Description>
                      </div>
                      {#if selectedStory.exerciseId}
                        <a
                          href="/exercises/{selectedStory.exerciseId}"
                          class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0 pt-0.5"
                        >
                          View details
                        </a>
                      {/if}
                    </div>
                  </Card.Header>
                  <Card.Content>
                    <ExerciseProgressionPanel
                      exercise={{ id: selectedStory.exerciseId, name: selectedStory.exerciseName }}
                      clientId={viewingClient.id ?? undefined}
                    />
                  </Card.Content>
                </div>
              {/key}
            {/if}
          </Card.Root>
        </div>
      </Tabs.Content>

      <Tabs.Content value="muscles">
        <MuscleGroupInsightsPanel clientId={viewingClient.id ?? undefined} />
      </Tabs.Content>

      <Tabs.Content value="nutrition">
        <NutritionCorrelationPanel clientId={viewingClient.id ?? undefined} />
      </Tabs.Content>
    </Tabs.Root>
    </div>
  {/if}
</div>
