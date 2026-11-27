<!-- Canvas MP3: Nutrition › Recipes. Your recipes (the same as your own Recipes), how each is
     used in your meal plans, then the recipe editor. -->
<script lang="ts">
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import { recipeUse, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { DIET_TAG_LABELS, type Recipe } from "@logit/core/domain/nutrition";
  import CommunityPacks from "./CommunityPacks.svelte";
  import { loadRecipePack } from "./nutritionPacks";

  let { recipes, plans, ondelete, oncopy }: { recipes: Recipe[]; plans: CoachNutritionPlan[]; ondelete: (r: Recipe) => void; oncopy: (r: Recipe) => Promise<void> } = $props();
  let query = $state("");
  const shown = $derived(recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)));

  function useText(r: Recipe): string {
    const u = recipeUse(r.id, plans);
    return u.swapOnly ? "swap only" : u.plans ? `in ${u.plans} ${u.plans === 1 ? "plan" : "plans"}` : "not in a plan";
  }
  const actions = (r: Recipe): RowAction[] => [
    { id: "open", label: `Open ${r.name}`, href: `/coaching/nutrition/recipes/${r.id}` },
    { id: "delete", label: "Delete…", danger: true, separatorBefore: true, run: () => ondelete(r), disabled: recipeUse(r.id, plans).plans ? "Used in a meal plan" : undefined },
  ];
</script>

<div class="flex flex-col gap-4">
  <input bind:value={query} placeholder="Search recipes" aria-label="Search recipes" class="h-9 w-72 max-w-full rounded-[9px] border border-input bg-background px-3 text-[13px]" />
  <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Your recipes">
    {#each shown as r (r.id)}
      <ActionMenu actions={actions(r)} label="More for {r.name}">
        {#snippet children({ props, more })}
          <article {...props} class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3 first:border-t-0 data-[state=open]:bg-muted/40">
            <a href="/coaching/nutrition/recipes/{r.id}" class="flex min-w-0 flex-[1_1_300px] items-center gap-3">
              {#if r.photoUrl}<img src={r.photoUrl} alt="" class="size-10 shrink-0 rounded-[8px] object-cover" />{/if}
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="text-[14px] font-semibold">{r.name}</span>
                <span class="text-xs text-muted-foreground">{Math.round(r.perServing.kcal)} kcal a serving · {Math.round(r.perServing.proteinG)} g protein{(r.tags ?? []).length ? ` · ${(r.tags ?? []).map((t) => DIET_TAG_LABELS[t]).join(", ")}` : ""}</span>
              </span>
            </a>
            <span class="text-[13px] text-muted-foreground">{useText(r)}</span>
            {@render more()}
          </article>
        {/snippet}
      </ActionMenu>
    {:else}
      <p class="px-5 py-6 text-[13px] text-muted-foreground">{recipes.length ? "Nothing matches that." : "No recipes yet. Your recipes are the same ones you have in your own diary; ones you make here show there too."}</p>
    {/each}
  </section>
  <!-- Canvas Q1: recipe packs from the community, copied into yours. -->
  <h2 class="pt-2 text-sm font-semibold">From the community</h2>
  <CommunityPacks family="recipe-pack" what="recipe" load={loadRecipePack} describe={(r) => `${Math.round(r.perServing.kcal)} kcal a serving · ${Math.round(r.perServing.proteinG)} g protein`} oncopy={(r) => oncopy(r)} />
</div>
