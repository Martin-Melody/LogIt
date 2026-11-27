<!-- Canvas Q7: tapping a recipe in the plan. Photo, one serving's numbers, the ingredients for
     the whole recipe, and the method; Log it. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { PlannedFood } from "@logit/core/domain/CoachNutritionPlan";

  let { open, onOpenChange, food, coachName, logged, onlog }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    food: PlannedFood | null;
    coachName: string;
    logged: boolean;
    onlog: () => void;
  } = $props();
  const r = $derived(food?.recipe ?? null);
  const first = $derived(coachName.split(" ")[0] || coachName);
  /** The method as lines: Markdown numbered/bulleted lists, one step a line. */
  const steps = $derived((r?.notes ?? "").split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s*/, "").replace(/\*\*|__|[*_`]/g, "").trim()).filter(Boolean));
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[90svh] flex-col gap-3 overflow-y-auto p-0 sm:max-w-[420px]">
    {#if food && r}
      {#if r.photoUrl}<img src={r.photoUrl} alt="" class="aspect-[16/10] w-full object-cover" />{/if}
      <div class="flex flex-col gap-3 px-4 pb-4 {r.photoUrl ? '' : 'pt-4'}">
        <Dialog.Header>
          <Dialog.Title>{r.name}</Dialog.Title>
          <Dialog.Description>{food.servingsUsed ?? 1} {(food.servingsUsed ?? 1) === 1 ? "serving" : "servings"} · {Math.round(food.computed.kcal)} kcal · {Math.round(food.computed.proteinG)} P · {Math.round(food.computed.carbsG)} C · {Math.round(food.computed.fatG)} F · from {first}{r.minutes ? ` · ${r.minutes} min` : ""}</Dialog.Description>
        </Dialog.Header>
        <section>
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">For {r.servings} {r.servings === 1 ? "serving" : "servings"}</h3>
          <ul class="mt-1 flex flex-col text-[15px]">
            {#each r.ingredients as i (i.id)}<li class="flex justify-between gap-3 border-b border-border py-1.5"><span>{i.name}</span><span class="tabular-nums text-muted-foreground">{Math.round(i.grams)} g</span></li>{/each}
          </ul>
        </section>
        {#if steps.length}
          <section>
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</h3>
            <ol class="mt-1 flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">{#each steps as s, k (k)}<li>{s}</li>{/each}</ol>
          </section>
        {/if}
        <Button class="h-12" disabled={logged} onclick={onlog}>{logged ? "Logged" : `Log ${food.servingsUsed ?? 1} ${(food.servingsUsed ?? 1) === 1 ? "serving" : "servings"}`}</Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
