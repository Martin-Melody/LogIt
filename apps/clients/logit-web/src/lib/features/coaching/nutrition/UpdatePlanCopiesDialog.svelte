<!-- Canvas Q6 (meal plans): you changed a plan clients have copies of. Ticked copies take your
     version from their next day; a copy you changed for that client is left as is unless you tick
     it. Nothing they logged changes. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { toast } from "$lib/components/ui/sonner";
  import { getWebCoachNutritionPlanRepo } from "$lib/deps";
  import { withPlanFallback, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { copyState, updatePlanCopy } from "@logit/core/domain/givingMealPlan";

  export type PlanCopy = { plan: CoachNutritionPlan; username: string; name: string };
  let { open = $bindable(false), library, copies, onupdated }: { open?: boolean; library: CoachNutritionPlan; copies: PlanCopy[]; onupdated: () => void } = $props();

  const rows = $derived(copies.map((c) => ({ ...c, ...copyState(c.plan, library) })).filter((r) => r.behind));
  let tick = $state<string[]>([]);
  let busy = $state(false);
  $effect(() => {
    if (open) tick = rows.filter((r) => !r.changedForThem).map((r) => r.plan.id);
  });
  async function update() {
    busy = true;
    try {
      for (const r of rows.filter((x) => tick.includes(x.plan.id))) {
        await getWebCoachNutritionPlanRepo().savePlan(withPlanFallback(updatePlanCopy(r.plan, library)), r.username);
      }
      toast.success(`Updated ${tick.length} ${tick.length === 1 ? "client" : "clients"}`);
      open = false;
      onupdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update them");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Update clients on "{library.name}"?</Dialog.Title>
      <Dialog.Description>{rows.length} {rows.length === 1 ? "client has" : "clients have"} a copy from before your changes.</Dialog.Description>
    </Dialog.Header>
    <ul class="flex flex-col">
      {#each rows as r (r.plan.id)}
        <li class="flex items-start justify-between gap-3 border-t border-border py-2.5 text-[13px]">
          <span class="flex flex-col"><b class="font-medium">{r.name}</b>
            {#if r.changedForThem}<span class="text-xs text-muted-foreground">Their copy has your own changes for them; ticking replaces them with this version.</span>{/if}
          </span>
          <Switch aria-label="Update {r.name}" checked={tick.includes(r.plan.id)} onCheckedChange={(v) => (tick = v ? [...tick, r.plan.id] : tick.filter((x) => x !== r.plan.id))} />
        </li>
      {/each}
    </ul>
    <p class="text-xs text-muted-foreground">From their next day; nothing they logged changes. They get one quiet line in the app, not a notification.</p>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Only the library</Button>
      <Button disabled={busy || !tick.length} onclick={() => void update()}>{busy ? "Updating…" : `Update ${tick.length} ${tick.length === 1 ? "client" : "clients"}`}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
