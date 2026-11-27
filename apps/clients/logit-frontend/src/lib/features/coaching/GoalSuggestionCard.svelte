<!-- Canvas GL1 (client): the coach suggests a change to my goal. Use it, or keep mine; either way
     the coach is told. "Keep mine" is a normal answer, not a warning. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushNutritionGoal } from "$lib/sync/syncService";
  import { sendMessage } from "$lib/usecases/messages/sendMessage";
  import { goalLine, useGoalSuggestion, type GoalSuggestion } from "@logit/core/domain/goalSuggestion";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import type { NutritionGoal } from "@logit/core/domain/nutrition";
  import { onMount } from "svelte";

  let { suggestion, coachName, relationshipId, answered, onanswer }: {
    suggestion: GoalSuggestion;
    coachName: string;
    relationshipId: string;
    /** Already answered in this conversation: true used, false kept. */
    answered: boolean | null;
    onanswer: () => void;
  } = $props();

  let goal = $state<NutritionGoal | null>(null);
  let currentKg = $state<number | null>(null);
  let busy = $state(false);
  onMount(async () => {
    const repo = getNutritionRepo();
    goal = await repo.getGoal().catch(() => null);
    currentKg = smoothWeightSeries(await repo.listWeightEntries().catch(() => [])).currentKg ?? null;
  });
  const first = $derived(coachName.split(" ")[0] || coachName);
  const what = $derived(!goal ? "a change" : suggestion.goalType !== goal.goalType ? "a different goal" : suggestion.rateKgPerWeek < goal.targetRateKgPerWeek ? "a slower pace" : suggestion.rateKgPerWeek > goal.targetRateKgPerWeek ? "a faster pace" : "a change");

  async function answer(use: boolean) {
    busy = true;
    try {
      if (use && goal) {
        const next = useGoalSuggestion(goal, suggestion);
        await getNutritionRepo().saveGoal(next);
        pushNutritionGoal(next);
      }
      await sendMessage(relationshipId, use ? `I'll use your goal: ${goalLine(suggestion, currentKg)}.` : "I'll keep my goal for now.", undefined, undefined, { kind: "goal-answer", json: JSON.stringify({ id: suggestion.id, used: use }) });
      toast.success(use ? "Your goal is updated" : `${first} has been told`);
      onanswer();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't answer");
    } finally {
      busy = false;
    }
  }
</script>

<section class="mx-4 my-1 flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4 text-[14px]" aria-label="Goal suggestion from {coachName}">
  <p class="font-semibold">{first} suggests {what}</p>
  {#if goal}<p><span class="text-muted-foreground">Now:</span> {goalLine({ goalType: goal.goalType, rateKgPerWeek: goal.targetRateKgPerWeek, targetWeightKg: goal.targetWeightKg }, currentKg)}</p>{/if}
  <p><span class="text-muted-foreground">{first}'s suggestion:</span> {goalLine(suggestion, currentKg)}</p>
  {#if suggestion.note}<p class="text-muted-foreground">"{suggestion.note}"</p>{/if}
  {#if answered === null}
    <div class="flex gap-2">
      <Button class="h-11 flex-1" disabled={busy || !goal} onclick={() => void answer(true)}>Use {first}'s goal</Button>
      <Button variant="outline" class="h-11 flex-1" disabled={busy} onclick={() => void answer(false)}>Keep mine</Button>
    </div>
    <p class="text-xs text-muted-foreground">Either way {first} is told.</p>
  {:else}
    <p class="text-xs text-muted-foreground">{answered ? `You used ${first}'s goal.` : "You kept your goal."}</p>
  {/if}
</section>
