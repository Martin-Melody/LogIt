<script lang="ts">
  import type { PublicProfileData } from "@logit/core/api/socialApi";

  // The profile cards someone turned on in the app (their snapshot, built by their phone),
  // in their order.
  let { json, name }: { json: string | null; name: string } = $props();

  const data = $derived.by((): PublicProfileData | null => {
    if (!json) return null;
    try { return JSON.parse(json) as PublicProfileData; } catch { return null; }
  });

  type Card = "body" | "split" | "prs" | "photo" | "weight" | "streak" | "badges";
  const BY_ID: Record<string, Card> = {
    "profile-body-stats": "body", "profile-active-split": "split", "profile-personal-records": "prs",
    "profile-progress-photo": "photo", "profile-weight-trend": "weight", "profile-streak": "streak", "profile-milestones": "badges",
  };
  const cards = $derived.by((): Card[] => {
    const d = data;
    if (!d) return [];
    const has: Record<Card, boolean> = {
      body: !!d.bodyStats && (d.bodyStats.height != null || d.bodyStats.weight != null),
      split: !!d.activeSplit,
      prs: !!d.personalRecords?.length,
      photo: !!d.progressPhoto,
      weight: (d.weightTrend?.points.length ?? 0) > 1,
      streak: !!d.streak,
      badges: !!d.badges?.length,
    };
    return [...d.widgets].filter((w) => w.enabled && BY_ID[w.id] && has[BY_ID[w.id]]).sort((a, b) => a.order - b.order).map((w) => BY_ID[w.id]);
  });

  const trend = $derived.by(() => {
    const pts = data?.weightTrend?.points ?? [];
    if (pts.length < 2) return null;
    const kgs = pts.map((p) => p.kg);
    const lo = Math.min(...kgs), hi = Math.max(...kgs), span = hi - lo || 1;
    const line = pts.map((p, i) => `${(i / (pts.length - 1)) * 220},${6 + (1 - (p.kg - lo) / span) * 48}`).join(" ");
    const weeks = Math.max(1, Math.round((Date.parse(pts.at(-1)!.dateIso) - Date.parse(pts[0].dateIso)) / (7 * 86_400_000)));
    return { line, first: kgs[0], last: kgs.at(-1)!, weeks };
  });

  const streak = $derived.by(() => {
    const s = data?.streak;
    if (!s) return null;
    if (s.currentWeeks != null) return { now: `${s.currentWeeks} week${s.currentWeeks === 1 ? "" : "s"}`, more: [s.weeklyTarget ? `${s.weeklyTarget} workouts a week` : "", s.bestWeeks ? `best ${s.bestWeeks} weeks` : ""].filter(Boolean).join(" · ") };
    return { now: `${s.currentDays ?? 0} days`, more: s.bestDays ? `best ${s.bestDays} days` : "" };
  });
</script>

{#if cards.length}
  <div class="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
    {#each cards as card (card)}
      <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        {#if card === "streak" && streak}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Training streak</h2>
          <span class="text-[28px] font-bold leading-tight">{streak.now}</span>
          {#if streak.more}<span class="text-xs text-muted-foreground">{streak.more}</span>{/if}
        {:else if card === "weight" && trend}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weight trend</h2>
          <svg viewBox="0 0 220 60" class="h-[60px] w-full" role="img" aria-label="Weight from {trend.first} to {trend.last} kg over {trend.weeks} weeks">
            <polyline points={trend.line} fill="none" stroke="currentColor" stroke-width="2" class="text-sky-500" />
          </svg>
          <span class="text-xs text-muted-foreground">{trend.first.toFixed(1)} → {trend.last.toFixed(1)} kg · {trend.weeks} week{trend.weeks === 1 ? "" : "s"}</span>
        {:else if card === "prs"}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Personal records</h2>
          {#each data!.personalRecords!.slice(0, 4) as pr (pr.exerciseName)}
            <span class="flex justify-between gap-3 text-[13px]"><span class="truncate">{pr.exerciseName}</span><span class="shrink-0 text-muted-foreground">{pr.weight} kg × {pr.reps}</span></span>
          {/each}
        {:else if card === "split"}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current split</h2>
          <span class="text-sm font-semibold">{data!.activeSplit!.name}</span>
          <span class="text-xs leading-relaxed text-muted-foreground">{data!.activeSplit!.days.map((d) => d.name).join(" · ")}</span>
        {:else if card === "badges"}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Milestones</h2>
          <div class="flex flex-wrap gap-1.5">{#each data!.badges! as b (b.id)}<span class="rounded-full border border-border px-2.5 py-0.5 text-xs">{b.label}</span>{/each}</div>
        {:else if card === "photo"}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Progress photo</h2>
          <img src={data!.progressPhoto!.dataUrl} alt="{name}'s progress photo" class="max-h-64 w-full rounded-lg object-cover" />
        {:else if card === "body"}
          {@const b = data!.bodyStats!}
          <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Body stats</h2>
          <span class="text-sm">{[b.height != null ? `${b.height} ${b.heightUnit}` : "", b.weight != null ? `${b.weight} ${b.weightUnit}` : ""].filter(Boolean).join(" · ")}</span>
        {/if}
      </section>
    {/each}
  </div>
{/if}
