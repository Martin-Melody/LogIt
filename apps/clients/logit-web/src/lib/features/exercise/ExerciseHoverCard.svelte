<!-- Hover (or focus) an exercise name: 8 weeks of estimated 1RM, your best set and last time
     (canvas board 12). The name still links to the exercise page. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { bestWorkingSet } from "@logit/core/domain/sessionHistory";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";
  import { exerciseIndex } from "@logit/core/domain/exerciseIndex";
  import type { StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";

  let { exerciseId, name, sessions, class: className = "", children }: {
    exerciseId: string; name: string; sessions: WorkoutSession[]; class?: string; children: Snippet;
  } = $props();

  let open = $state(false);
  const WEEK = 7 * 86_400_000;
  const kg = (n: number) => `${Math.round(n * 10) / 10} kg`;
  const stats = $derived.by(() => {
    if (!open) return null;
    const mine = sessions.filter((s) => s.blocks.some((b) => b.type === "strength" && (b.data as StrengthBlockData).exerciseId === exerciseId));
    const best = exerciseIndex(mine).find((e) => e.id === exerciseId) ?? null;
    // The best estimated 1RM in each of the last 8 weeks (null where it wasn't done).
    const now = Date.now();
    const weeks: (number | null)[] = Array.from({ length: 8 }, () => null);
    let last: { weight: number; reps: number; at: number } | null = null;
    for (const s of mine) {
      for (const b of s.blocks) {
        const d = b.data as StrengthBlockData;
        if (b.type !== "strength" || d.exerciseId !== exerciseId) continue;
        const set = bestWorkingSet(d.sets);
        if (!set) continue;
        if (!last || s.startedAtMs > last.at) last = { ...set, at: s.startedAtMs };
        const w = 7 - Math.floor((now - s.startedAtMs) / WEEK);
        if (w >= 0 && w < 8 && set.weight > 0) weeks[w] = Math.max(weeks[w] ?? 0, estimated1RM(set.weight, set.reps));
      }
    }
    const done = weeks.filter((v): v is number => v != null);
    const lo = Math.min(...done), hi = Math.max(...done);
    const points = weeks.map((v, i) => (v == null ? null : [i * (280 / 7), 46 - (hi > lo ? ((v - lo) / (hi - lo)) * 40 : 20)] as const)).filter((p) => p != null);
    return { best, last, points, change: done.length > 1 ? done[done.length - 1]! - done[0]! : null };
  });
</script>

<HoverCard.Root bind:open openDelay={400} closeDelay={100}>
  <HoverCard.Trigger href="/exercises/{exerciseId}" class={className}>{@render children()}</HoverCard.Trigger><!--
  --><HoverCard.Content class="w-80 p-4" align="start">
    {#if stats}
      <div class="flex flex-col gap-3 text-[13px]">
        <strong class="text-[15px]">{name}</strong>
        {#if stats.points.length > 1}
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Estimated 1RM, last 8 weeks</span>
            <svg viewBox="-4 0 288 52" class="h-14 w-full" role="img" aria-label="Estimated 1RM over the last 8 weeks">
              <polyline points={stats.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" class="text-foreground/80" />
              {#each stats.points as p, i (i)}<circle cx={p[0]} cy={p[1]} r={i === stats.points.length - 1 ? 3.5 : 2} class={i === stats.points.length - 1 ? "fill-foreground" : "fill-foreground/60"} />{/each}
            </svg>
          </div>
        {/if}
        <dl class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5">
          {#if stats.best && stats.best.weight > 0}
            <dt class="text-muted-foreground">Best set</dt><dd>{kg(stats.best.weight)} × {stats.best.reps}</dd>
            <dt class="text-muted-foreground">e1RM</dt><dd>{kg(stats.best.e1rm)}{#if stats.change}<span class="ml-1.5 {stats.change > 0 ? 'text-success' : 'text-muted-foreground'}">{stats.change > 0 ? "+" : "−"}{kg(Math.abs(stats.change))} in 8 weeks</span>{/if}</dd>
          {/if}
          {#if stats.last}
            <dt class="text-muted-foreground">Last time</dt><dd>{stats.last.weight > 0 ? `${kg(stats.last.weight)} × ${stats.last.reps}` : `${stats.last.reps} reps`} · {new Date(stats.last.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</dd>
          {/if}
        </dl>
        <a href="/exercises/{exerciseId}" class="inline-flex h-[34px] items-center justify-center rounded-[9px] border border-border text-[13px] font-medium hover:bg-muted">Open {name}</a>
      </div>
    {/if}
  </HoverCard.Content>
</HoverCard.Root>
