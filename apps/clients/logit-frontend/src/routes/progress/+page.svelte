<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import * as Tabs from "$lib/components/ui/tabs";
  import ExerciseProgressionPanel from "$lib/features/exercise/components/ExerciseProgressionPanel.svelte";
  import ProgressStatusChip from "$lib/features/exercise/components/ProgressStatusChip.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import Sparkline from "$lib/features/exercise/components/Sparkline.svelte";
  import MuscleGroupInsightsPanel from "$lib/features/exercise/components/MuscleGroupInsightsPanel.svelte";
  import NutritionCorrelationPanel from "$lib/features/exercise/components/NutritionCorrelationPanel.svelte";
  import { getAllExerciseProgressStories } from "@logit/core/usecases/progression/getAllExerciseProgressStories";
  import type { ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import { PROGRESS_STATUS_ATTENTION_ORDER, type ProgressStatus } from "@logit/core/domain/progression";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { reveal, popIn } from "$lib/transitions";
  import { fade } from "svelte/transition";

  const ui = $state({ loading: true, error: null as string | null });

  let stories = $state<ExerciseProgressStory[]>([]);
  let selected = $state<string | null>(null);
  let tab = $state("exercises");

  const selectedStory = $derived(
    stories.find((s) => s.exerciseName === selected) ?? null,
  );

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

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      stories = await getAllExerciseProgressStories(getProgressionDeps());
      if (stories.length > 0 && !selected) selected = rows[0]?.exerciseName ?? stories[0].exerciseName;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load progress";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => { void load(); });
</script>

<div class="p-3 flex flex-col gap-3 pb-32">
  {#if ui.loading}
    <Card.Root><Card.Content class="pt-6"><p class="text-sm text-muted-foreground">Loading…</p></Card.Content></Card.Root>
  {:else if ui.error}
    <Card.Root><Card.Content class="pt-6"><p class="text-sm text-destructive">{ui.error}</p></Card.Content></Card.Root>
  {:else if stories.length === 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>Progress</Card.Title>
        <Card.Description>
          Complete at least 2 sessions with the same exercise to see your progress here.
        </Card.Description>
      </Card.Header>
    </Card.Root>
  {:else}
    <div in:fade={{ duration: 160 }}>
    <Tabs.Root bind:value={tab} class="gap-3">
      <Tabs.List class="w-full">
        <Tabs.Trigger value="exercises" class="flex-1">Exercises</Tabs.Trigger>
        <Tabs.Trigger value="muscles" class="flex-1">Muscle groups</Tabs.Trigger>
        <Tabs.Trigger value="nutrition" class="flex-1">Nutrition</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="exercises">
        <div class="flex flex-col gap-3">
        {#if selectedStory}
          {#key selected}
          <Card.Root>
            <div in:reveal>
            <Card.Header class="pb-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <Card.Title class="text-base truncate">{selectedStory.exerciseName}</Card.Title>
                  <Card.Description>
                    Last trained {formatDate(selectedStory.lastTrainedMs)}
                  </Card.Description>
                </div>
                {#if selectedStory.exerciseId}
                  <a href="/exercises/{selectedStory.exerciseId}" class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0 pt-0.5">
                    View details
                  </a>
                {/if}
              </div>
            </Card.Header>
            <Card.Content>
              <ExerciseProgressionPanel exercise={{ id: selectedStory.exerciseId, name: selectedStory.exerciseName }} />
            </Card.Content>
            </div>
          </Card.Root>
          {/key}
        {/if}

        <Card.Root>
          <Card.Header class="pb-2"><Card.Title>Exercises</Card.Title></Card.Header>
          <Card.Content class="pt-0">
            {#each rows as ex, i (ex.exerciseName)}
              {@const isSelected = selected === ex.exerciseName}
              <div
                in:popIn={{ duration: 200, delay: Math.min(i * 30, 240) }}
                class="flex items-center gap-3 w-full py-3 border-b last:border-0 border-border transition-opacity {isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'}"
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  onclick={() => (selected = ex.exerciseName)}
                >
                  <p class="text-sm font-medium truncate">{ex.exerciseName}</p>
                  <div class="flex items-center gap-2 mt-1">
                    <ProgressStatusChip status={ex.status} />
                    <span class="text-xs text-muted-foreground truncate">{ex.statusDetail}</span>
                  </div>
                </button>
                <!-- Sibling, not nested in the button above — ReasoningDialog renders
                     its own trigger button, and buttons can't nest. -->
                <ReasoningDialog reasoning={ex.trendReasoning} triggerLabel="Why?" />
                <Sparkline values={ex.spark} class="shrink-0" />
                <span class="text-sm font-semibold tabular-nums shrink-0 w-14 text-right">{ex.headline.value}</span>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
        </div>
      </Tabs.Content>

      <Tabs.Content value="muscles">
        <MuscleGroupInsightsPanel />
      </Tabs.Content>

      <Tabs.Content value="nutrition">
        <NutritionCorrelationPanel />
      </Tabs.Content>
    </Tabs.Root>
    </div>
  {/if}
</div>
