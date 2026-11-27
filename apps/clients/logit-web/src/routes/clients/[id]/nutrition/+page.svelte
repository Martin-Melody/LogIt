<!-- A client's own copy of their meal plan (canvas MP6 "Edit her copy"): the same builder as your
     library plans; changes reach only them, from their next sync. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { clientName } from "$lib/features/coaching/clientName";
  import MealPlanBuilder from "$lib/features/coaching/nutrition/MealPlanBuilder.svelte";
  import { getOwnNutritionDeps, getWebCoachNutritionPlanRepo } from "$lib/deps";
  import { planFromIso, planOn, updateCoachNutritionPlan, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { DIET_TAGS, DIET_TAG_LABELS, localDateIso, type DietTag, type Recipe } from "@logit/core/domain/nutrition";

  const clientId = $derived(page.params.id!);
  const username = $derived(page.url.searchParams.get("u") ?? "");
  let plan = $state<CoachNutritionPlan | null>(null);
  let recipes = $state<Recipe[]>([]);
  let loaded = $state(false);
  let status = $state<"saved" | "saving" | "error">("saved");
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const [rows, mine] = await Promise.all([
      getWebCoachNutritionPlanRepo().listMine({ recipientId: clientId }).catch(() => []),
      getOwnNutritionDeps().nutritionRepo.listRecipes().catch(() => []),
    ]);
    const wanted = page.url.searchParams.get("plan");
    const all = rows.map((r) => r.plan);
    plan = (wanted ? all.find((p) => p.id === wanted) : null) ?? planOn(all, localDateIso()) ?? null;
    recipes = mine.filter((r) => !r.deletedAtMs);
    loaded = true;
  });

  function setPlan(next: CoachNutritionPlan) {
    plan = next;
    status = "saving";
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  }
  const edit = (patch: Partial<CoachNutritionPlan>) => plan && setPlan(updateCoachNutritionPlan(plan, patch));
  async function save() {
    if (!plan || !username) return;
    try {
      await getWebCoachNutritionPlanRepo().savePlan($state.snapshot(plan) as CoachNutritionPlan, username);
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
  <PageCrumbs crumbs={[{ label: "Clients", href: "/clients" }, { label: clientName(clientId, username ? `@${username}` : "Client"), href: `/clients/${clientId}`, clientId }, { label: "Nutrition", href: `/clients/${clientId}?tab=nutrition` }, { label: plan?.name ?? "Meal plan" }]} />
  {#if !loaded}
    <Skeleton class="h-72" />
  {:else if !plan}
    <div class="flex flex-col items-start gap-3 rounded-[12px] border border-border bg-card p-5 text-[13px]">
      <p>They don't have a meal plan from you.</p>
      <Button href="/clients/{clientId}?tab=nutrition&give=1">Give a meal plan…</Button>
    </div>
  {:else}
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-[2_1_260px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name
        <input value={plan.name} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) edit({ name: v }); }} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[15px] font-semibold text-foreground" />
      </label>
      <span class="pb-2 text-xs text-muted-foreground" aria-live="polite">{status === "saving" ? "Saving…" : status === "error" ? "Couldn't save" : "Saved"}</span>
    </div>
    <p class="text-[13px] text-muted-foreground">Their own copy, since {new Date(`${planFromIso(plan)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Changes reach only them, on their next sync.</p>
    <MealPlanBuilder {plan} {recipes} onchange={setPlan} />
    <section class="flex flex-col gap-2 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Good for">
      <h2 class="text-sm font-semibold">Good for</h2>
      <div class="flex flex-wrap gap-1.5">
        {#each DIET_TAGS as t (t)}
          {@const on = (plan.tags ?? []).includes(t)}
          <Button size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onclick={() => toggleTag(t)}>{DIET_TAG_LABELS[t]}</Button>
        {/each}
      </div>
    </section>
    <section class="flex flex-col gap-1.5 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Note">
      <Label for="copy-note">Note for them</Label>
      <Textarea id="copy-note" rows={3} value={plan.note ?? ""} onchange={(e) => edit({ note: e.currentTarget.value.trim() || undefined })} />
    </section>
  {/if}
</div>
