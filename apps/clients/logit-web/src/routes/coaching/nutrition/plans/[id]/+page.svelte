<!-- A meal plan in your library (canvas MP1, MP2): its name, the builder (how days work, each
     day's targets and timed meals), what it's good for, and a note to clients. Saves as you go. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { getOwnNutritionDeps, getWebCoachNutritionPlanRepo } from "$lib/deps";
  import MealPlanBuilder from "$lib/features/coaching/nutrition/MealPlanBuilder.svelte";
  import { mealPlanSummary, updateCoachNutritionPlan, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { DIET_TAGS, DIET_TAG_LABELS, type DietTag, type Recipe } from "@logit/core/domain/nutrition";

  const id = $derived(page.params.id!);
  let plan = $state<CoachNutritionPlan | null>(null);
  let loaded = $state(false);
  let status = $state<"saved" | "saving" | "error">("saved");
  let timer: ReturnType<typeof setTimeout> | undefined;

  let recipes = $state<Recipe[]>([]);
  onMount(async () => {
    const [rows, mine] = await Promise.all([
      getWebCoachNutritionPlanRepo().listMine().catch(() => []),
      getOwnNutritionDeps().nutritionRepo.listRecipes().catch(() => []),
    ]);
    plan = rows.find((r) => r.plan.id === id && r.recipientUserId === null)?.plan ?? null;
    recipes = mine.filter((r) => !r.deletedAtMs);
    loaded = true;
  });

  function edit(patch: Partial<CoachNutritionPlan>) {
    if (plan) setPlan(updateCoachNutritionPlan(plan, patch));
  }
  /** Every change (the builder's too) saves 0.7 s after the last one. */
  function setPlan(next: CoachNutritionPlan) {
    plan = next;
    status = "saving";
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  }
  async function save() {
    if (!plan) return;
    try {
      await getWebCoachNutritionPlanRepo().savePlan($state.snapshot(plan) as CoachNutritionPlan);
      status = "saved";
    } catch {
      status = "error";
      toast.error("Couldn't save. Trying again shortly.");
      timer = setTimeout(save, 5000);
    }
  }

  function toggleTag(t: DietTag) {
    const tags = plan?.tags ?? [];
    edit({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  }
</script>


<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={[{ label: "Nutrition", href: "/coaching/nutrition" }, { label: plan?.name ?? "Meal plan" }]} />
  {#if !loaded}
    <Skeleton class="h-72" />
  {:else if !plan}
    <p class="rounded-[10px] bg-muted px-4 py-3 text-[13px]">That meal plan isn't one of yours, or it's been deleted.</p>
  {:else}
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-[2_1_260px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name
        <input value={plan.name} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) edit({ name: v }); }} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[15px] font-semibold text-foreground" />
      </label>
      <span class="pb-2 text-xs text-muted-foreground" aria-live="polite">{status === "saving" ? "Saving…" : status === "error" ? "Couldn't save" : "Saved"}</span>
    </div>
    <p class="text-[13px] text-muted-foreground">{mealPlanSummary(plan)}</p>

    <MealPlanBuilder {plan} {recipes} onchange={(next) => setPlan(next)} />

    <section class="flex flex-col gap-2 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Good for">
      <h2 class="text-sm font-semibold">Good for</h2>
      <div class="flex flex-wrap gap-1.5">
        {#each DIET_TAGS as t (t)}
          {@const on = (plan.tags ?? []).includes(t)}
          <Button size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onclick={() => toggleTag(t)}>{DIET_TAG_LABELS[t]}</Button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">You tick these; LogIt doesn't guess. Foods that don't fit are pointed out in the builder.</p>
    </section>

    <section class="flex flex-col gap-1.5 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Note">
      <Label for="plan-note">Note for clients</Label>
      <Textarea id="plan-note" rows={3} value={plan.note ?? ""} placeholder="Eat the meals in any order; swap dinner and lunch if you like." onchange={(e) => edit({ note: e.currentTarget.value.trim() || undefined })} />
    </section>
  {/if}
</div>
