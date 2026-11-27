<!-- Canvas MP8: the grocery list for the next 7 days, each day's own meals (training or rest),
     recipes as their ingredients, what they eat in place of food they don't. Ticks stay on this
     phone; Share sends it as plain text. -->
<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { Check } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import { toast } from "$lib/components/ui/sonner/index";
  import { groceryForDays } from "@logit/core/domain/mealPlanDay";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { loadPlanToday } from "$lib/features/nutrition/plan/planToday";
  import { trainingDayOn } from "$lib/features/nutrition/trainingDay";

  let items = $state<{ name: string; brand?: string; grams: number }[]>([]);
  let counts = $state({ training: 0, rest: 0 });
  let loading = $state(true);
  let hasPlan = $state(false);
  const KEY = "logit:nutrition:grocery-ticks:v1";
  let ticked = $state<string[]>([]);

  onMount(async () => {
    const s = await loadPlanToday().catch(() => null);
    hasPlan = !!s?.plan;
    if (s?.plan) {
      const days = await Promise.all([...Array(7)].map(async (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const iso = localDateIso(d);
        return { dateIso: iso, training: await trainingDayOn(iso) };
      }));
      counts = { training: days.filter((d) => d.training).length, rest: days.filter((d) => !d.training).length };
      items = groceryForDays(s.plan, days, s.avoid);
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { planId?: string; ticked?: string[] };
        ticked = saved.planId === s.plan.id ? (saved.ticked ?? []) : [];
      } catch { ticked = []; }
      planId = s.plan.id;
    }
    loading = false;
  });
  let planId = "";
  function toggle(name: string) {
    ticked = ticked.includes(name) ? ticked.filter((x) => x !== name) : [...ticked, name];
    localStorage.setItem(KEY, JSON.stringify({ planId, ticked }));
  }
  const amount = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${g} g`);
  async function share() {
    const text = `Grocery list, next 7 days\n${items.map((i) => `- ${i.name}${i.brand ? ` (${i.brand})` : ""}: ${amount(i.grams)}`).join("\n")}`;
    try {
      if (navigator.share) await navigator.share({ title: "Grocery list", text });
      else { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    } catch { /* closed the share sheet */ }
  }
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/nutrition/plan")} />
    <h1 class="page-title flex-1">Grocery list</h1>
    {#if items.length}<Button variant="ghost" class="h-11" onclick={() => void share()}>Share</Button>{/if}
  </PageHeader>
  {#if loading}
    <p class="px-4 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !hasPlan}
    <p class="px-4 py-6 text-sm text-muted-foreground">No meal plan, so nothing to shop for.</p>
  {:else}
    <p class="px-4 py-2 text-sm text-muted-foreground">Next 7 days · {counts.training} training, {counts.rest} rest</p>
    <ul class="flex flex-col">
      {#each items as i (i.name + (i.brand ?? ""))}
        {@const on = ticked.includes(i.name)}
        <li><button type="button" role="checkbox" aria-checked={on} onclick={() => toggle(i.name)} class="flex min-h-12 w-full items-center gap-3 border-b border-border px-4 text-left text-[15px] active:bg-muted">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors {on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}">{#if on}<Check class="size-4" />{/if}</span>
          <span class="flex-1 {on ? 'text-muted-foreground line-through' : ''}">{i.name}{#if i.brand}<span class="text-muted-foreground"> · {i.brand}</span>{/if}</span>
          <span class="tabular-nums text-muted-foreground">{amount(i.grams)}</span>
        </button></li>
      {:else}
        <li class="px-4 py-6 text-sm text-muted-foreground">The plan has no foods yet.</li>
      {/each}
    </ul>
  {/if}
</div>
