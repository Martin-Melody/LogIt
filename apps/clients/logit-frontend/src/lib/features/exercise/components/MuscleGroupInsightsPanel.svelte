<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import ProgressStatusChip from "./ProgressStatusChip.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import { getMuscleGroupInsights } from "@logit/core/usecases/progression/getMuscleGroupInsights";
  import type { MuscleGroupInsight } from "@logit/core/usecases/progression/getMuscleGroupInsights";
  import { PROGRESS_STATUS_ATTENTION_ORDER, type ProgressStatus } from "@logit/core/domain/progression";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { popIn } from "$lib/transitions";

  const ui = $state({ loading: true, error: null as string | null });
  let insights = $state<MuscleGroupInsight[]>([]);
  let untaggedSetsShare = $state(0);

  const STATUS_RANK: Record<ProgressStatus, number> = Object.fromEntries(
    PROGRESS_STATUS_ATTENTION_ORDER.map((s, i) => [s, i]),
  ) as Record<ProgressStatus, number>;

  const rows = $derived(
    [...insights].sort(
      (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.avgWeeklySets - a.avgWeeklySets,
    ),
  );

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const result = await getMuscleGroupInsights(getProgressionDeps());
      insights = result.insights;
      untaggedSetsShare = result.untaggedSetsShare;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load muscle group insights";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => { void load(); });
</script>

{#if ui.loading}
  <Card.Root><Card.Content class="pt-6"><p class="text-sm text-muted-foreground">Loading…</p></Card.Content></Card.Root>
{:else if ui.error}
  <Card.Root><Card.Content class="pt-6"><p class="text-sm text-destructive">{ui.error}</p></Card.Content></Card.Root>
{:else if rows.length === 0}
  <Card.Root>
    <Card.Header>
      <Card.Title>Muscle groups</Card.Title>
      <Card.Description>
        Tag an exercise's primary muscles (open it from Exercises) to see weekly volume
        and frequency per muscle group here.
      </Card.Description>
    </Card.Header>
  </Card.Root>
{:else}
  <div class="flex flex-col gap-2">
    {#if untaggedSetsShare > 0.1}
      <p class="text-xs text-muted-foreground px-1">
        ~{Math.round(untaggedSetsShare * 100)}% of your logged sets come from exercises
        without muscle tags, so they're not reflected below.
      </p>
    {/if}
    {#each rows as g, i (g.muscleGroup)}
      <div in:popIn={{ duration: 200, delay: Math.min(i * 30, 240) }}>
        <Card.Root>
          <Card.Content class="pt-4 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold">{capitalize(g.muscleGroup)}</span>
                <ProgressStatusChip status={g.status} />
              </div>
              <ReasoningDialog reasoning={g.reasoning} />
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{g.currentWeekSets}</p>
                <p class="text-xs text-muted-foreground mt-0.5">Sets this week</p>
              </div>
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{g.avgWeeklySets}</p>
                <p class="text-xs text-muted-foreground mt-0.5">Avg sets/week</p>
              </div>
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{g.avgWeeklyFrequency}</p>
                <p class="text-xs text-muted-foreground mt-0.5">Sessions/week</p>
              </div>
            </div>

            <p class="text-xs text-muted-foreground">{capitalize(g.reasoning.verdict)}</p>

            {#if g.contributingExercises.length > 0}
              <div class="flex flex-wrap gap-1">
                {#each g.contributingExercises as ce (ce.exerciseName)}
                  <span class="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{ce.exerciseName}</span>
                {/each}
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    {/each}
  </div>
{/if}
