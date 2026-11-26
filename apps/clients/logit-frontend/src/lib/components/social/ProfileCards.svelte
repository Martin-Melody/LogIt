<!-- The Training tab (design canvas PR1/PR6): the cards someone chose to show, in their order.
     The same list for your own profile (live numbers) and anyone else's (their last push). -->

<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";
  import type { PublicProfileData } from "@logit/core/api/socialApi";
  import { shownCards } from "@logit/core/domain/profileCards";
  import WeightTrendWidget from "$lib/features/profileWidgets/components/WeightTrendWidget.svelte";
  import StreakWidget from "$lib/features/profileWidgets/components/StreakWidget.svelte";
  import MilestoneBadgesWidget from "$lib/features/profileWidgets/components/MilestoneBadgesWidget.svelte";

  const { data, name }: { data: PublicProfileData; name: string } = $props();
  const cards = $derived(shownCards(data));
  const fmt = (v: number | null | undefined, unit: string) => (v != null ? `${v} ${unit}` : "—");
</script>

{#snippet head(title: string)}
  <h2 class="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
{/snippet}

<div class="flex flex-col gap-4 px-3 py-4">
  {#each cards as kind (kind)}
    <section>
      {#if kind === "body" && data.bodyStats}
        {@render head("Body")}
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-3.5 py-3 text-[15px]">
          <dt class="text-muted-foreground">Height</dt><dd class="text-right font-semibold tabular-nums">{fmt(data.bodyStats.height, data.bodyStats.heightUnit)}</dd>
          <dt class="text-muted-foreground">Weight</dt><dd class="text-right font-semibold tabular-nums">{fmt(data.bodyStats.weight, data.bodyStats.weightUnit)}</dd>
        </dl>
      {:else if kind === "split" && data.activeSplit}
        {@render head("Training")}
        <div class="rounded-xl border border-border bg-card px-3.5 py-3">
          <p class="text-[15px] font-medium">{data.activeSplit.name}</p>
          <ul class="mt-1.5 flex flex-col gap-1">
            {#each data.activeSplit.days as day, i (i)}
              <li class="flex items-center justify-between gap-2 text-[13px]">
                <span class="shrink-0 text-muted-foreground">{day.name}</span>
                <span class="truncate text-right">{day.exercises.slice(0, 3).join(", ")}{day.exercises.length > 3 ? "…" : ""}</span>
              </li>
            {/each}
          </ul>
        </div>
      {:else if kind === "prs" && data.personalRecords}
        {@render head("Records")}
        <ul class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {#each data.personalRecords as pr (pr.exerciseName)}
            <li class="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[15px]">
              <span class="truncate">{pr.exerciseName}</span>
              <span class="shrink-0 font-semibold tabular-nums">{pr.weight} kg × {pr.reps}</span>
            </li>
          {/each}
        </ul>
      {:else if kind === "photo" && data.progressPhoto}
        {@render head("Progress photo")}
        <img src={photoSrc(data.progressPhoto.dataUrl)} alt="{name}'s progress photo" class="aspect-square w-full rounded-xl border border-border object-cover" />
      {:else if kind === "weight" && data.weightTrend}
        <WeightTrendWidget data={data.weightTrend} />
      {:else if kind === "streak" && data.streak}
        <StreakWidget data={data.streak} />
      {:else if kind === "badges" && data.badges}
        <MilestoneBadgesWidget data={data.badges} />
      {/if}
    </section>
  {/each}
</div>
