<!-- Nutrition (canvas MP1, MP3, Q3): meal plans, recipes and rules, like Programs. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import MealPlansTab from "$lib/features/coaching/nutrition/MealPlansTab.svelte";
  import RecipesTab from "$lib/features/coaching/nutrition/RecipesTab.svelte";
  import NutritionRulesTab from "$lib/features/coaching/nutrition/NutritionRulesTab.svelte";
  import { loadCoachNutrition } from "$lib/features/coaching/nutrition/nutritionData";
  import { getOwnNutritionDeps, getWebCoachNutritionPlanRepo } from "$lib/deps";
  import { coachApi } from "@logit/core/api/coachApi";
  import type { MyCoachNutritionPlan } from "@logit/core/data/coachNutritionPlanRepo";
  import { createCoachNutritionPlan, updateCoachNutritionPlan, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { createId } from "@logit/core/domain/ids";
  import { createRecipe, type Recipe } from "@logit/core/domain/nutrition";

  const tab = $derived.by(() => { const t = page.url.searchParams.get("tab"); return t === "recipes" || t === "rules" ? t : "plans"; });
  const setTab = (v: string) => void goto(v === "plans" ? "/coaching/nutrition" : `/coaching/nutrition?tab=${v}`, { replaceState: true, noScroll: true, keepFocus: true });

  let rows = $state<MyCoachNutritionPlan[]>([]);
  let recipes = $state<Recipe[]>([]);
  let loaded = $state(false);
  let busy = $state(false);
  onMount(async () => {
    ({ rows, recipes } = await loadCoachNutrition());
    loaded = true;
  });
  const plans = $derived(rows.map((r) => r.plan));

  async function newPlan() {
    busy = true;
    try {
      const s = await coachApi.getCoachSettings().catch(() => null);
      const p = { ...createCoachNutritionPlan("New meal plan"), ...(s?.nutrition?.windowDays ? { adaptivePrefs: { windowDays: s.nutrition.windowDays } } : {}) };
      await getWebCoachNutritionPlanRepo().savePlan(p);
      await goto(`/coaching/nutrition/plans/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make it");
    } finally {
      busy = false;
    }
  }
  async function newRecipe() {
    busy = true;
    try {
      const r = createRecipe("New recipe", 4);
      await getOwnNutritionDeps().nutritionRepo.saveRecipe(r);
      await goto(`/coaching/nutrition/recipes/${r.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make it");
    } finally {
      busy = false;
    }
  }
  async function duplicate(p: CoachNutritionPlan) {
    const now = Date.now();
    const copy: CoachNutritionPlan = { ...structuredClone($state.snapshot(p)) as CoachNutritionPlan, id: createId("cnplan"), name: `${p.name} (copy)`, archived: false, createdAtMs: now, updatedAtMs: now };
    try {
      await getWebCoachNutritionPlanRepo().savePlan(copy);
      rows = [...rows, { plan: copy, recipientUserId: null }];
      toast.success(`Made ${copy.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't duplicate it");
    }
  }
  async function archive(p: CoachNutritionPlan, archived: boolean) {
    const next = updateCoachNutritionPlan(p, { archived });
    try {
      await getWebCoachNutritionPlanRepo().savePlan(next);
      rows = rows.map((r) => (r.plan.id === p.id ? { ...r, plan: next } : r));
      toast.success(archived ? "Archived. Clients keep theirs." : "Back in your plans");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  let deleting = $state<Recipe | null>(null);
  async function deleteRecipe() {
    const r = deleting;
    deleting = null;
    if (!r) return;
    try {
      await getOwnNutritionDeps().nutritionRepo.deleteRecipe(r.id);
      recipes = recipes.filter((x) => x.id !== r.id);
      toast.success(`Deleted ${r.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete it");
    }
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Nutrition</h1>
      <p class="mt-0.5 text-[13px] text-muted-foreground">Meal plans, your recipes, and how targets are set.</p>
    </div>
    {#if tab === "plans"}<Button disabled={busy} onclick={() => void newPlan()}>New meal plan</Button>
    {:else if tab === "recipes"}<Button disabled={busy} onclick={() => void newRecipe()}>New recipe</Button>{/if}
  </header>
  <Tabs.Root value={tab} onValueChange={setTab}>
    <Tabs.List variant="line" aria-label="Meal plans, recipes and rules">
      <Tabs.Trigger value="plans">Meal plans</Tabs.Trigger>
      <Tabs.Trigger value="recipes">Recipes</Tabs.Trigger>
      <Tabs.Trigger value="rules">Rules</Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>
  {#if !loaded}
    <Skeleton class="h-64" />
  {:else if tab === "recipes"}
    <RecipesTab {recipes} {plans} ondelete={(r) => (deleting = r)} />
  {:else if tab === "rules"}
    <NutritionRulesTab {plans} />
  {:else}
    <MealPlansTab {rows} onduplicate={(p) => void duplicate(p)} onarchive={(p, a) => void archive(p, a)} />
  {/if}
</div>

<AlertDialog.Root open={!!deleting} onOpenChange={(o) => { if (!o) deleting = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete {deleting?.name}?</AlertDialog.Title>
      <AlertDialog.Description>It goes from your recipes here and in your own diary. Days you logged it keep it.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void deleteRecipe()}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
