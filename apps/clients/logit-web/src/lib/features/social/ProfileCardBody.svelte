<script lang="ts">
  import type { PublicProfileData } from "@logit/core/api/socialApi";
  import type { CardKind } from "./profileCards";

  // What's inside one profile card (its title is the caller's), from the phone's snapshot.
  let { data, kind, name }: { data: PublicProfileData; kind: CardKind; name: string } = $props();

  const trend = $derived.by(() => {
    const pts = data.weightTrend?.points ?? [];
    if (pts.length < 2) return null;
    const kgs = pts.map((p) => p.kg);
    const lo = Math.min(...kgs), hi = Math.max(...kgs), span = hi - lo || 1;
    const line = pts.map((p, i) => `${(i / (pts.length - 1)) * 220},${6 + (1 - (p.kg - lo) / span) * 48}`).join(" ");
    const weeks = Math.max(1, Math.round((Date.parse(pts.at(-1)!.dateIso) - Date.parse(pts[0].dateIso)) / (7 * 86_400_000)));
    return { line, first: kgs[0], last: kgs.at(-1)!, weeks };
  });

  const streak = $derived.by(() => {
    const s = data.streak;
    if (!s) return null;
    if (s.currentWeeks != null) return { now: `${s.currentWeeks} week${s.currentWeeks === 1 ? "" : "s"}`, more: [s.weeklyTarget ? `${s.weeklyTarget} workouts a week` : "", s.bestWeeks ? `best ${s.bestWeeks} weeks` : ""].filter(Boolean).join(" · ") };
    return { now: `${s.currentDays ?? 0} days`, more: s.bestDays ? `best ${s.bestDays} days` : "" };
  });
</script>

{#if kind === "streak" && streak}
  <span class="text-[28px] font-bold leading-tight">{streak.now}</span>
  {#if streak.more}<span class="text-xs text-muted-foreground">{streak.more}</span>{/if}
{:else if kind === "weight" && trend}
  <svg viewBox="0 0 220 60" class="h-[60px] w-full" role="img" aria-label="Weight from {trend.first} to {trend.last} kg over {trend.weeks} weeks">
    <polyline points={trend.line} fill="none" stroke="currentColor" stroke-width="2" class="text-sky-500" />
  </svg>
  <span class="text-xs text-muted-foreground">{trend.first.toFixed(1)} → {trend.last.toFixed(1)} kg · {trend.weeks} week{trend.weeks === 1 ? "" : "s"}</span>
{:else if kind === "prs" && data.personalRecords?.length}
  {#each data.personalRecords.slice(0, 4) as pr (pr.exerciseName)}
    <span class="flex justify-between gap-3 text-[13px]"><span class="truncate">{pr.exerciseName}</span><span class="shrink-0 text-muted-foreground">{pr.weight} kg × {pr.reps}</span></span>
  {/each}
{:else if kind === "split" && data.activeSplit}
  <span class="text-sm font-semibold">{data.activeSplit.name}</span>
  <span class="text-xs leading-relaxed text-muted-foreground">{data.activeSplit.days.map((d) => d.name).join(" · ")}</span>
{:else if kind === "badges" && data.badges?.length}
  <div class="flex flex-wrap gap-1.5">{#each data.badges as b (b.id)}<span class="rounded-full border border-border px-2.5 py-0.5 text-xs">{b.label}</span>{/each}</div>
{:else if kind === "photo" && data.progressPhoto}
  <img src={data.progressPhoto.dataUrl} alt="{name}'s progress photo" class="max-h-64 w-full rounded-lg object-cover" draggable="false" />
{:else if kind === "body" && data.bodyStats && (data.bodyStats.height != null || data.bodyStats.weight != null)}
  {@const b = data.bodyStats}
  <span class="text-sm">{[b.height != null ? `${b.height} ${b.heightUnit}` : "", b.weight != null ? `${b.weight} ${b.weightUnit}` : ""].filter(Boolean).join(" · ")}</span>
{:else}
  <span class="text-xs leading-relaxed text-muted-foreground">Nothing to show yet, so people won't see this card. It fills in from the app.</span>
{/if}
