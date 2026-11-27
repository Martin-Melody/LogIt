<!-- Canvas MP1: Nutrition › Meal plans. Yours (library plans, with how many clients have a copy)
     and the community's. A meal plan can be just targets or full meals. -->
<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import type { MyCoachNutritionPlan } from "@logit/core/data/coachNutritionPlanRepo";
  import { mealPlanSummary, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import CommunityPacks from "./CommunityPacks.svelte";
  import { loadMealPlanPack } from "./nutritionPacks";

  let { rows, onduplicate, onarchive, ongive, oncopy }: {
    rows: MyCoachNutritionPlan[];
    /** Copy a community pack's plan into yours (canvas Q1). */
    oncopy: (p: CoachNutritionPlan) => Promise<void>;
    ongive: (p: CoachNutritionPlan) => void;
    onduplicate: (p: CoachNutritionPlan) => void;
    onarchive: (p: CoachNutritionPlan, archived: boolean) => void;
  } = $props();

  let source = $state<"yours" | "community">("yours");
  let showArchived = $state(false);
  const library = $derived(rows.filter((r) => r.recipientUserId === null).map((r) => r.plan).sort((a, b) => a.name.localeCompare(b.name)));
  const shown = $derived(library.filter((p) => showArchived || !p.archived));
  const clientsOn = (id: string) => rows.filter((r) => r.recipientUserId && r.plan.sourcePlanId === id && !r.plan.archived && !r.plan.untilIso).length;

  const actions = (p: CoachNutritionPlan): RowAction[] => [
    { id: "open", label: `Open ${p.name}`, href: `/coaching/nutrition/plans/${p.id}` },
    { id: "give", label: "Give to a client…", run: () => ongive(p), disabled: p.archived ? "Archived" : undefined },
    { id: "dup", label: "Duplicate", run: () => onduplicate(p) },
    { id: "archive", label: p.archived ? "Back in your plans" : "Archive", run: () => onarchive(p, !p.archived), separatorBefore: true },
  ];
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <Tabs.Root value={source} onValueChange={(v) => (source = v as typeof source)}>
      <Tabs.List aria-label="Whose plans">
        <Tabs.Trigger value="yours">Yours <span class="ml-1 text-muted-foreground">{library.filter((p) => !p.archived).length}</span></Tabs.Trigger>
        <Tabs.Trigger value="community">Community</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    {#if source === "yours" && library.some((p) => p.archived)}
      <Button variant="ghost" size="sm" onclick={() => (showArchived = !showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
    {/if}
  </div>

  {#if source === "community"}
    <CommunityPacks family="meal-plan-pack" what="meal plan" load={loadMealPlanPack} describe={mealPlanSummary} oncopy={(p) => oncopy(p)} />
  {:else}
    <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Your meal plans">
      {#each shown as p (p.id)}
        {@const n = clientsOn(p.id)}
        <ActionMenu actions={actions(p)} label="More for {p.name}">
          {#snippet children({ props, more })}
            <article {...props} class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3 first:border-t-0 data-[state=open]:bg-muted/40 {p.archived ? 'opacity-60' : ''}">
              <a href="/coaching/nutrition/plans/{p.id}" class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
                <span class="text-[14px] font-semibold">{p.name}{#if p.archived}<span class="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Archived</span>{/if}</span>
                <span class="text-xs text-muted-foreground">{mealPlanSummary(p)}</span>
              </a>
              <span class="text-[13px] {n ? '' : 'text-muted-foreground'}">{n ? `${n} ${n === 1 ? "client" : "clients"}` : "No clients yet"}</span>
              {@render more()}
            </article>
          {/snippet}
        </ActionMenu>
      {:else}
        <div class="flex flex-col items-start gap-2 px-5 py-6 text-[13px]">
          <p>No meal plans yet.</p>
          <p class="text-muted-foreground">A meal plan can be just targets (calories and protein, say) or full meals. Coaches who don't do food never need this page: clients log against their own targets.</p>
        </div>
      {/each}
    </section>
  {/if}
</div>
