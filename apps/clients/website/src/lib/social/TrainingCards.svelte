<!-- The training cards on a public profile (design canvas PR5): the same cards, in the same
     order, as in the app. Plain HTML so search engines read them; no charts library. -->
<script lang="ts">
  import { parseProfileData, shownCards } from "@logit/core/domain/profileCards";
  import { photoUrl } from "./publicApi";

  const { json, api, name }: { json: string | null; api: string; name: string } = $props();
  const data = $derived(parseProfileData(json));
  const cards = $derived(shownCards(data));

  function line(points: { kg: number }[]): string {
    const kgs = points.map((p) => p.kg);
    const lo = Math.min(...kgs);
    const span = Math.max(...kgs) - lo || 1;
    return points.map((p, i) => `${(i / (points.length - 1)) * 300},${54 - ((p.kg - lo) / span) * 48}`).join(" ");
  }
</script>

{#snippet title(text: string)}
  <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{text}</h3>
{/snippet}

{#if data && cards.length}
  <div class="flex flex-col gap-3">
    {#each cards as kind (kind)}
      <section class="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
        {#if kind === "split" && data.activeSplit}
          {@render title("Training")}
          <p class="font-semibold text-heading">{data.activeSplit.name}</p>
          <ul class="flex flex-col gap-0.5 text-sm">
            {#each data.activeSplit.days as day, i (i)}
              <li class="flex justify-between gap-3"><span class="shrink-0 text-muted-foreground">{day.name}</span><span class="truncate text-right">{day.exercises.slice(0, 3).join(", ")}</span></li>
            {/each}
          </ul>
        {:else if kind === "prs" && data.personalRecords}
          {@render title("Records")}
          <ul class="flex flex-col gap-1 text-sm">
            {#each data.personalRecords.slice(0, 6) as pr (pr.exerciseName)}
              <li class="flex justify-between gap-3"><span class="truncate">{pr.exerciseName}</span><span class="shrink-0 font-semibold tabular-nums">{pr.weight} kg × {pr.reps}</span></li>
            {/each}
          </ul>
        {:else if kind === "body" && data.bodyStats}
          {@render title("Body")}
          <p class="flex justify-between text-sm"><span class="text-muted-foreground">Height</span><span class="font-semibold">{data.bodyStats.height ?? "–"} {data.bodyStats.height != null ? data.bodyStats.heightUnit : ""}</span></p>
          <p class="flex justify-between text-sm"><span class="text-muted-foreground">Weight</span><span class="font-semibold">{data.bodyStats.weight ?? "–"} {data.bodyStats.weight != null ? data.bodyStats.weightUnit : ""}</span></p>
        {:else if kind === "weight" && data.weightTrend}
          {@const pts = data.weightTrend.points}
          {@render title("Weight trend")}
          <p class="flex justify-between text-sm"><span class="font-semibold">{pts[pts.length - 1]!.kg} kg</span><span class="text-muted-foreground">{(pts[pts.length - 1]!.kg - pts[0]!.kg >= 0 ? "+" : "") + (pts[pts.length - 1]!.kg - pts[0]!.kg).toFixed(1)} kg since {new Date(pts[0]!.dateIso).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}</span></p>
          <svg viewBox="0 0 300 60" preserveAspectRatio="none" class="h-14 w-full text-primary" role="img" aria-label="Weight from {pts[0]!.kg} to {pts[pts.length - 1]!.kg} kg">
            <polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" points={line(pts)} />
          </svg>
        {:else if kind === "photo" && data.progressPhoto}
          {@render title("Progress photo")}
          <img src={photoUrl(api, data.progressPhoto.dataUrl)} alt="{name}'s progress photo" class="aspect-square w-full rounded-lg object-cover" loading="lazy" />
        {:else if kind === "streak" && data.streak}
          {@render title("Streak")}
          {#if data.streak.currentWeeks != null}
            <p class="text-sm"><span class="font-semibold">{data.streak.currentWeeks} {data.streak.currentWeeks === 1 ? "week" : "weeks"}</span> <span class="text-muted-foreground">in a row · best {data.streak.bestWeeks ?? data.streak.currentWeeks}</span></p>
          {:else}
            <p class="text-sm"><span class="font-semibold">{data.streak.currentDays ?? 0} days</span> <span class="text-muted-foreground">· best {data.streak.bestDays ?? 0}</span></p>
          {/if}
        {:else if kind === "badges" && data.badges}
          {@render title("Milestones")}
          <ul class="flex flex-wrap gap-1.5">{#each data.badges as b (b.id)}<li class="rounded-full border border-border px-2.5 py-1 text-xs">{b.label}</li>{/each}</ul>
        {/if}
      </section>
    {/each}
  </div>
{/if}
