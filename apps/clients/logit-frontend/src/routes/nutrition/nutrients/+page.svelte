<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import {
    NUTRIENTS,
    dayNutrients,
    formatNutrient,
    localDateIso,
    percentOfDaily,
    type DayNutrients,
    type NutrientGroup,
    type NutrientId,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { back } from "$lib/navigation";
  import { fmtNum } from "$lib/features/nutrition/ui/meals";

  // Everything eaten on a day beyond calories and macros: the label four, then vitamins and
  // minerals as a share of the daily amount. Tap a row for the foods it came from.
  const dateIso = $derived(page.url.searchParams.get("date") || localDateIso());
  let data = $state<DayNutrients | null>(null);
  let loading = $state(true);
  let open = $state<NutrientId | null>(null);

  onMount(() => void load());

  async function load() {
    loading = true;
    try {
      const day = await getNutritionRepo().getDay(dateIso);
      data = dayNutrients(day && !day.deletedAtMs ? day.items : []);
    } finally {
      loading = false;
    }
  }

  const dateLabel = $derived.by(() => {
    if (dateIso === localDateIso()) return "Today";
    const d = new Date(`${dateIso}T12:00:00`);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  });

  const GROUPS: { id: NutrientGroup; title: string }[] = [
    { id: "label", title: "From the label" },
    { id: "vitamin", title: "Vitamins" },
    { id: "mineral", title: "Minerals" },
  ];

  type Row = {
    id: NutrientId;
    name: string;
    value: string;
    /** "of 30 g", "max 6 g", "no target", or "84%". */
    goal: string;
    width: number;
    tone: "plain" | "met" | "over";
    known: boolean;
  };

  function rows(group: NutrientGroup, d: DayNutrients): Row[] {
    return NUTRIENTS.filter((n) => n.group === group).map((n) => {
      const v = d.totals[n.id];
      const known = v !== undefined;
      const amount = v ?? 0;
      if (group === "label") {
        const ratio = n.daily ? amount / n.daily : 0;
        return {
          id: n.id,
          name: n.name,
          value: known ? formatNutrient(n.id, amount) : "–",
          goal: n.daily ? `${n.kind === "max" ? "max" : "of"} ${n.daily} g` : "no target",
          width: Math.min(ratio * 100, 100),
          tone: n.kind === "max" && ratio > 1 ? "over" : n.kind === "min" && ratio >= 1 ? "met" : "plain",
          known,
        };
      }
      const pct = percentOfDaily(n.id, amount) ?? 0;
      return {
        id: n.id,
        name: n.name,
        value: known ? formatNutrient(n.id, amount) : "–",
        goal: known ? `${pct}%` : "no data",
        width: Math.min(pct, 100),
        tone: pct >= 100 ? "met" : "plain",
        known,
      };
    });
  }

  const BAR: Record<Row["tone"], string> = {
    plain: "bg-foreground/80",
    met: "bg-macro-protein",
    over: "bg-macro-carbs",
  };

  const coverPct = $derived(
    data && data.coverage.kcal > 0 ? Math.round((data.coverage.kcalWithMicros / data.coverage.kcal) * 100) : 0,
  );

  function listNames(names: string[]): string {
    if (names.length <= 1) return names.join("");
    if (names.length > 4) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
</script>

<PageHeader>
  <BackButton onclick={() => back("/nutrition")} />
  <div class="min-w-0 flex-1">
    <h1 class="page-title leading-tight">Nutrients</h1>
    <p class="text-xs text-muted-foreground">{dateLabel}</p>
  </div>
</PageHeader>

<div class="flex flex-col gap-4 px-3 pb-10 pt-2">
  {#if loading}
    <p class="px-1 py-6 text-sm text-muted-foreground">Loading…</p>
  {:else if !data || data.coverage.items === 0}
    <p class="px-1 py-6 text-sm text-muted-foreground">Nothing logged on this day yet.</p>
  {:else}
    {@const d = data}
    <div class="rounded-2xl bg-card px-4 py-3.5" data-testid="micro-coverage">
      <div class="flex items-baseline justify-between gap-2.5">
        <span class="text-[13px] font-semibold">Vitamin &amp; mineral data</span>
        <span class="text-xs text-muted-foreground tabular-nums">{d.coverage.withMicros} of {d.coverage.items} foods</span>
      </div>
      <div class="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
        <div class="h-full rounded-full bg-foreground/80" style="width: {coverPct}%"></div>
      </div>
      <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
        {#if d.coverage.withMicros === d.coverage.items}
          Covers everything you logged.
        {:else}
          Covers {fmtNum(d.coverage.kcalWithMicros)} of your {fmtNum(d.coverage.kcal)} kcal.
          {listNames(d.missingMicros)} {d.missingMicros.length === 1 ? "has" : "have"} no vitamin or mineral data (packaged labels
          usually only list the basics), so the real totals below are a bit higher.
        {/if}
      </p>
    </div>

    {#each GROUPS as g (g.id)}
      <section aria-labelledby="grp-{g.id}">
        <h2 id="grp-{g.id}" class="px-1 pb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
        <div class="overflow-hidden rounded-2xl bg-card">
          {#each rows(g.id, d) as r, i (r.id)}
            {@const sources = d.sources[r.id] ?? []}
            <div class={i > 0 ? "border-t border-border" : ""}>
              <button
                type="button"
                class="block min-h-13 w-full px-4 py-2.5 text-left disabled:cursor-default"
                aria-expanded={open === r.id}
                disabled={sources.length === 0}
                onclick={() => (open = open === r.id ? null : r.id)}
                data-testid="nutrient-{r.id}"
              >
                <span class="flex items-baseline gap-2">
                  <span class="flex-1 font-medium">{r.name}</span>
                  {#if g.id === "label"}
                    <span class="font-semibold tabular-nums">{r.value}</span>
                    <span class="min-w-[66px] text-right text-xs text-muted-foreground tabular-nums">{r.goal}</span>
                  {:else}
                    {#if r.known}<span class="text-xs text-muted-foreground tabular-nums">{r.value}</span>{/if}
                    <span class="min-w-11 text-right tabular-nums {r.known ? 'font-semibold' : 'text-xs text-muted-foreground'}">{r.goal}</span>
                  {/if}
                </span>
                {#if r.known && r.goal !== "no target"}
                  <span class="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span class="block h-full rounded-full {BAR[r.tone]}" style="width: {r.width}%"></span>
                  </span>
                {/if}
              </button>
              {#if open === r.id}
                <div class="px-4 pb-3" data-testid="nutrient-sources">
                  {#each sources.slice(0, 6) as s (s.name)}
                    <div class="flex justify-between py-0.5 text-xs">
                      <span class="truncate pr-3 text-muted-foreground">{s.name}</span>
                      <span class="tabular-nums">{formatNutrient(r.id, s.amount)}</span>
                    </div>
                  {/each}
                  {#if g.id !== "label" && d.missingMicros.length > 0}
                    <p class="mt-1.5 text-[11px] text-muted-foreground">
                      Not counted: {d.missingMicros.length} {d.missingMicros.length === 1 ? "food" : "foods"} without this data.
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}

    <p class="px-1 text-xs leading-relaxed text-muted-foreground">
      Daily amounts are the UK and EU reference intakes for adults. Fibre is a minimum to reach; saturated fat and salt are
      maximums to stay under. Sugar has no target because labels don't separate added sugar from the sugar in fruit and milk.
    </p>
  {/if}
</div>
