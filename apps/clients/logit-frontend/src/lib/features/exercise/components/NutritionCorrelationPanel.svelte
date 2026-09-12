<script lang="ts">
  // §9 (adaptive-progression-engine.md) — nutrition x training correlation.
  // Deliberately framed as a hypothesis being tested, never a flat claim
  // (Martin's "extra caution" call) -- the reasoning dialog's confidence
  // badge and the "hypothesis:" wording in the verdict do that work, same
  // machinery as every other status chip in the app, not bespoke copy here.
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import { getNutritionTrainingCorrelation } from "@logit/core/usecases/nutritionTrainingCorrelation";
  import type { NutritionTrainingCorrelationResult } from "@logit/core/usecases/nutritionTrainingCorrelation";
  import { getWorkoutRepo, getNutritionRepo } from "$lib/data/repoProvider";
  import { popIn } from "$lib/transitions";

  const ui = $state({ loading: true, error: null as string | null });
  let result = $state<NutritionTrainingCorrelationResult | null>(null);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      result = await getNutritionTrainingCorrelation({
        workoutRepo: getWorkoutRepo(),
        nutritionRepo: getNutritionRepo(),
      });
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load nutrition correlation";
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
{:else if !result?.dayLevelProtein && !result?.mealTimingCarbs}
  <Card.Root>
    <Card.Header>
      <Card.Title>Nutrition × training</Card.Title>
      <Card.Description>
        {result?.dayLevelReasoning.verdict ?? "Keep logging your diary alongside your sessions to see if a pattern emerges."}
      </Card.Description>
    </Card.Header>
  </Card.Root>
{:else}
  <div class="flex flex-col gap-2">
    {#if result.dayLevelProtein}
      <div in:popIn={{ duration: 200 }}>
        <Card.Root>
          <Card.Content class="pt-4 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold">Protein & session volume</span>
              <ReasoningDialog reasoning={result.dayLevelReasoning} />
            </div>
            <p class="text-sm text-muted-foreground">{result.dayLevelReasoning.verdict}</p>
            <div class="grid grid-cols-2 gap-2">
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{Math.round(result.dayLevelProtein.above.improveRate * 100)}%</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  Improved · ≥{result.dayLevelProtein.thresholdProteinG}g protein days
                </p>
              </div>
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{Math.round(result.dayLevelProtein.below.improveRate * 100)}%</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  Improved · &lt;{result.dayLevelProtein.thresholdProteinG}g protein days
                </p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}

    {#if result.mealTimingCarbs}
      <div in:popIn={{ duration: 200, delay: 60 }}>
        <Card.Root>
          <Card.Content class="pt-4 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold">Pre-session carbs</span>
              <ReasoningDialog reasoning={result.mealTimingReasoning} />
            </div>
            <p class="text-sm text-muted-foreground">{result.mealTimingReasoning.verdict}</p>
            <div class="grid grid-cols-2 gap-2">
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{Math.round(result.mealTimingCarbs.withCarbs.improveRate * 100)}%</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  Improved · carbs {result.mealTimingCarbs.windowMinutesBefore[0]}-{result.mealTimingCarbs.windowMinutesBefore[1]}min before
                </p>
              </div>
              <div class="text-center">
                <p class="text-base font-semibold tabular-nums">{Math.round(result.mealTimingCarbs.withoutCarbs.improveRate * 100)}%</p>
                <p class="text-xs text-muted-foreground mt-0.5">Improved · without</p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  </div>
{/if}
