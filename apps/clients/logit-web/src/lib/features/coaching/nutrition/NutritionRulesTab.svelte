<!-- Canvas Q3: Nutrition › Rules. How targets are set (the built-in Adaptive targets and its
     settings, nutrition plugins you've added) and which food swaps clients may make. Mirrors
     Programs › Rules. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type CoachSettings, type FoodSwapRule } from "@logit/core/api/coachApi";
  import type { CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";

  let { plans }: { plans: CoachNutritionPlan[] } = $props();
  let settings = $state<CoachSettings | null>(null);
  let windowDays = $state(28);
  onMount(async () => {
    settings = await coachApi.getCoachSettings().catch(() => null);
    windowDays = settings?.nutrition?.windowDays ?? 28;
    void plugins.loadInstalls().catch(() => {});
  });
  const adaptiveIn = $derived(plans.filter((p) => !p.archived && p.kcalMode === "adaptive").length);
  const nutritionPlugins = $derived(plugins.installed.filter((p) => p.manifest.family === "nutrition-algorithm"));

  async function save(patch: { foodSwapRule?: FoodSwapRule; windowDays?: number }) {
    try {
      settings = await coachApi.setNutritionSettings(patch);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  const SWAPS: { value: FoodSwapRule; label: string; hint: string }[] = [
    { value: "mine", label: "Only your swaps", hint: "The swaps you add to each food." },
    { value: "close", label: "Your swaps, then foods close to the plan", hint: "The same kind of food, within 15% of the calories and protein." },
  ];
</script>

<div class="flex flex-col gap-4">
  <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="How targets are set">
    <h2 class="px-5 pb-2 pt-4 text-sm font-semibold">How targets are set</h2>
    <article class="flex flex-col gap-3 border-t border-border px-5 py-3.5">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <span class="text-[14px] font-semibold">Adaptive targets <span class="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Built in</span></span>
          <span class="text-xs text-muted-foreground">A standard formula first, then corrected from their weight and food trend after about two weeks.</span>
        </span>
        <span class="text-[13px] {adaptiveIn ? '' : 'text-muted-foreground'}">{adaptiveIn ? `In ${adaptiveIn} ${adaptiveIn === 1 ? "plan" : "plans"}` : "Not in a plan"}</span>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-[13px]">
        <label for="window" class="font-medium">Trend window</label>
        <span class="flex items-center gap-1.5">
          <Button variant="outline" size="icon" class="size-8" aria-label="7 days fewer" disabled={windowDays <= 7} onclick={() => { windowDays -= 7; void save({ windowDays }); }}>−</Button>
          <span id="window" class="w-16 text-center tabular-nums">{windowDays} days</span>
          <Button variant="outline" size="icon" class="size-8" aria-label="7 days more" disabled={windowDays >= 56} onclick={() => { windowDays += 7; void save({ windowDays }); }}>+</Button>
        </span>
        <span class="text-xs text-muted-foreground">Your default for new meal plans using it. Shorter follows changes sooner but jumps about more.</span>
      </div>
    </article>
    {#each nutritionPlugins as p (p.manifest.id)}
      <article class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3.5">
        <span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <span class="text-[14px] font-semibold">{p.manifest.name} <span class="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Plugin</span></span>
          <span class="text-xs text-muted-foreground">{typeof p.manifest.author === "string" ? `By ${p.manifest.author} · ` : ""}clients are asked to allow it</span>
        </span>
        <Button variant="outline" size="sm" href="/plugins/{encodeURIComponent(p.manifest.id)}">Open</Button>
      </article>
    {/each}
    <div class="border-t border-border px-5 py-3"><Button variant="outline" size="sm" href="/plugins?family=nutrition">Browse community rules</Button></div>
  </section>

  <section class="flex flex-col gap-2 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Food swaps">
    <h2 class="text-sm font-semibold">Food swaps</h2>
    <div class="flex flex-col gap-1.5" role="radiogroup" aria-label="Which food swaps clients may make">
      {#each SWAPS as s (s.value)}
        {@const on = (settings?.foodSwapRule ?? "mine") === s.value}
        <button type="button" role="radio" aria-checked={on} onclick={() => void save({ foodSwapRule: s.value })}
          class="flex flex-col rounded-[10px] border px-3.5 py-2.5 text-left transition-colors {on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}">
          <span class="text-[13px] font-medium">{s.label}</span><span class="text-xs text-muted-foreground">{s.hint}</span>
        </button>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">Logging anything else is always allowed; it shows as off plan.</p>
  </section>
</div>
