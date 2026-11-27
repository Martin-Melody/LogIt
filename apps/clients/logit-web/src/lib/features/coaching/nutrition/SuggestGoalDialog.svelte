<!-- Canvas GL1: suggest a change to a client's own goal. Goals are theirs; they use yours or keep
     theirs, and either way you're told. Adaptive targets aim at their goal pace, so if the pace
     is wrong, suggest a change rather than fight it with targets. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { goalLine, type GoalSuggestion } from "@logit/core/domain/goalSuggestion";
  import type { GoalType, NutritionGoal } from "@logit/core/domain/nutrition";

  let { open = $bindable(false), goal, currentKg, relationshipId, name, onsent }: {
    open?: boolean; goal: NutritionGoal; currentKg: number | null; relationshipId: string; name: string; onsent?: () => void;
  } = $props();
  let goalType = $state<GoalType>("lose");
  let rate = $state(0.5);
  let target = $state("");
  let note = $state("");
  let busy = $state(false);
  $effect(() => {
    if (!open) return;
    goalType = goal.goalType;
    rate = goal.targetRateKgPerWeek;
    target = goal.targetWeightKg ? String(goal.targetWeightKg) : "";
    note = "";
  });
  const suggestion = $derived<Omit<GoalSuggestion, "id">>({ goalType, rateKgPerWeek: Math.round(rate * 10) / 10, ...(Number(target) > 0 ? { targetWeightKg: Number(target) } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
  const now = $derived(goalLine({ goalType: goal.goalType, rateKgPerWeek: goal.targetRateKgPerWeek, targetWeightKg: goal.targetWeightKg }, currentKg));
  const next = $derived(goalLine(suggestion, currentKg));
  const what = $derived(goalType !== goal.goalType ? "a different goal" : rate < goal.targetRateKgPerWeek ? "a slower pace" : rate > goal.targetRateKgPerWeek ? "a faster pace" : "a change");

  async function send() {
    busy = true;
    try {
      const s: GoalSuggestion = { id: createId("goal"), ...suggestion };
      await messagesApi.send({
        relationshipId, messageId: createId("msg"), createdAtMs: Date.now(),
        body: `I suggest ${what}: ${next}.${s.note ? ` ${s.note}` : ""}`,
        kind: "goal-suggestion", cardJson: JSON.stringify(s),
      });
      toast.success(`Sent. ${name} decides.`);
      open = false;
      onsent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Suggest a change to {name}'s goal</Dialog.Title>
      <Dialog.Description>Their goal is theirs: they can use yours or keep theirs, and you'll be told which.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3 text-[13px]">
      <p><span class="text-muted-foreground">Now:</span> {now}</p>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5"><Label>Goal</Label>
          <OptionSelect value={goalType} aria-label="Goal" options={[{ value: "lose", label: "Lose weight" }, { value: "maintain", label: "Keep it steady" }, { value: "gain", label: "Gain weight" }]} onValueChange={(v) => (goalType = v as GoalType)} />
        </div>
        {#if goalType !== "maintain"}
          <div class="flex flex-col gap-1.5"><Label>Pace</Label>
            <span class="flex h-9 items-center gap-1.5">
              <Button variant="outline" size="icon" class="size-8" aria-label="Slower" disabled={rate <= 0.1} onclick={() => (rate = Math.max(0.1, Math.round((rate - 0.1) * 10) / 10))}>−</Button>
              <span class="w-20 text-center tabular-nums">{rate.toFixed(1)} kg/wk</span>
              <Button variant="outline" size="icon" class="size-8" aria-label="Faster" disabled={rate >= 1.5} onclick={() => (rate = Math.min(1.5, Math.round((rate + 0.1) * 10) / 10))}>+</Button>
            </span>
          </div>
        {/if}
        <div class="flex flex-col gap-1.5"><Label for="goal-target">Target weight <span class="font-normal text-muted-foreground">kg, optional</span></Label>
          <input id="goal-target" bind:value={target} inputmode="decimal" class="h-9 rounded-[9px] border border-input bg-background px-2.5" />
        </div>
      </div>
      <p><span class="text-muted-foreground">Your suggestion:</span> {next}</p>
      <div class="flex flex-col gap-1.5"><Label for="goal-why">Why <span class="font-normal text-muted-foreground">they see it</span></Label>
        <Textarea id="goal-why" rows={2} bind:value={note} placeholder="You're training hard; a slower cut keeps your squat moving." />
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy} onclick={() => void send()}>{busy ? "Sending…" : "Suggest it"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
