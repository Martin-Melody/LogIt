<!-- A meal plan in your library (canvas MP1, NT1): its name, targets (fixed or Adaptive calories,
     the macros you set, and more nutrients), what it's good for, and a note to clients. Saves as
     you go. Meals and day types are the meal plan builder (canvas MP2). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { getWebCoachNutritionPlanRepo } from "$lib/deps";
  import { mealPlanSummary, updateCoachNutritionPlan, type CoachNutritionPlan, type NutrientTarget } from "@logit/core/domain/CoachNutritionPlan";
  import { DIET_TAGS, DIET_TAG_LABELS, type DietTag } from "@logit/core/domain/nutrition";
  import { NUTRIENTS, type NutrientId } from "@logit/core/domain/nutrients";

  const id = $derived(page.params.id!);
  let plan = $state<CoachNutritionPlan | null>(null);
  let loaded = $state(false);
  let status = $state<"saved" | "saving" | "error">("saved");
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const rows = await getWebCoachNutritionPlanRepo().listMine().catch(() => []);
    plan = rows.find((r) => r.plan.id === id && r.recipientUserId === null)?.plan ?? null;
    loaded = true;
  });

  function edit(patch: Partial<CoachNutritionPlan>) {
    if (!plan) return;
    plan = updateCoachNutritionPlan(plan, patch);
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
  const num = (v: string) => { const n = Number(v.replace(",", ".")); return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };

  // Canvas NT1: targets beyond calories and protein.
  let moreOpen = $state(false);
  const label = NUTRIENTS.filter((n) => n.group === "label");
  const micro = NUTRIENTS.filter((n) => n.group !== "label");
  const targetOf = (nid: NutrientId) => plan?.nutrients?.find((x) => x.id === nid) ?? null;
  function setTarget(nid: NutrientId, t: NutrientTarget | null) {
    const rest = (plan?.nutrients ?? []).filter((x) => x.id !== nid);
    edit({ nutrients: t ? [...rest, t] : rest });
  }
  function toggleTag(t: DietTag) {
    const tags = plan?.tags ?? [];
    edit({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  }
  const fieldCls = "h-9 w-full rounded-[9px] border border-input bg-background px-2.5 text-[13px]";
</script>

{#snippet nutrientRow(n: (typeof NUTRIENTS)[number])}
  {@const t = targetOf(n.id)}
  <div class="grid grid-cols-[1fr_8rem_6rem] items-center gap-2 border-t border-border py-1.5 text-[13px]">
    <label class="flex items-center gap-2"><Switch checked={!!t} aria-label="Set a target for {n.name}" onCheckedChange={(v) => setTarget(n.id, v ? { id: n.id, kind: n.kind === "max" ? "atMost" : "atLeast", amount: n.daily ?? 1 } : null)} />{n.name}</label>
    {#if t}
      <OptionSelect size="sm" value={t.kind} aria-label="{n.name}: at least, at most or about" options={[{ value: "atLeast", label: "At least" }, { value: "atMost", label: "At most" }, { value: "about", label: "About" }]} onValueChange={(v) => setTarget(n.id, { ...t, kind: v as NutrientTarget["kind"] })} />
      <span class="flex items-center gap-1"><input class="h-8 w-16 rounded-[7px] border border-input bg-background px-2" inputmode="decimal" aria-label="{n.name} amount" value={t.amount} onchange={(e) => { const v = Number(e.currentTarget.value.replace(",", ".")); if (v > 0) setTarget(n.id, { ...t, amount: v }); }} /><span class="text-xs text-muted-foreground">{n.unit}</span></span>
    {:else}
      <span class="col-span-2 text-xs text-muted-foreground">Their own target, or none</span>
    {/if}
  </div>
{/snippet}

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

    <section class="flex flex-col gap-4 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Targets">
      <h2 class="text-sm font-semibold">Targets</h2>
      <div class="flex flex-col gap-1.5">
        <Label>Calories</Label>
        <div class="flex flex-wrap items-center gap-3">
          <OptionSelect value={plan.kcalMode ?? "fixed"} aria-label="How calories are set" class="w-56"
            options={[{ value: "fixed", label: "You set them" }, { value: "adaptive", label: "Adaptive targets" }]}
            onValueChange={(v) => edit({ kcalMode: v as "fixed" | "adaptive" })} />
          <span class="flex items-center gap-1.5"><input class="{fieldCls} w-24" inputmode="numeric" aria-label="Calories" value={plan.kcalTarget} onchange={(e) => { const v = num(e.currentTarget.value); if (v) edit({ kcalTarget: v }); }} /><span class="text-xs text-muted-foreground">kcal</span></span>
        </div>
        <p class="text-xs text-muted-foreground">{plan.kcalMode === "adaptive" ? "Calories follow each client's own Adaptive targets, aimed at their goal pace; this number is the starting point and how day types differ from it." : "The same calories every day, until you change them."}</p>
      </div>
      <div class="grid grid-cols-3 gap-3">
        {#each [["proteinG", "Protein"], ["carbsG", "Carbs"], ["fatG", "Fat"]] as const as [key, name] (key)}
          <div class="flex flex-col gap-1.5"><Label for="t-{key}">{name} <span class="font-normal text-muted-foreground">g</span></Label>
            <input id="t-{key}" class={fieldCls} inputmode="numeric" placeholder="Theirs" value={plan[key] ?? ""} onchange={(e) => edit({ [key]: num(e.currentTarget.value) } as Partial<CoachNutritionPlan>)} />
          </div>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">Leave one empty and they keep their own target for it (from their goal).</p>

      <div class="flex flex-col">
        <span class="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">More targets</span>
        {#each label as n (n.id)}{@render nutrientRow(n)}{/each}
        {#if moreOpen}
          {#each micro as n (n.id)}{@render nutrientRow(n)}{/each}
        {/if}
        <Button variant="outline" size="sm" class="mt-2 self-start" onclick={() => (moreOpen = !moreOpen)}>{moreOpen ? "Fewer" : `Vitamins and minerals (${micro.length})`}</Button>
        <p class="mt-2 text-xs text-muted-foreground">Many foods don't list vitamins, so a vitamin target is only as good as the labels; their diary says when a day's number is incomplete.</p>
      </div>
    </section>

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
