<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Sharing } from "@logit/core/api/coachApi";
  import { blockDisplayName, type StrengthBlockData, type WorkoutSession } from "@logit/core/domain/workout";
  import { bestWorkingSet, historyPRs, sessionTitle, type HistoryPR } from "@logit/core/domain/sessionHistory";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";
  import { getWebDeps } from "$lib/deps";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { sessionVolumeKg } from "$lib/features/sessionVolume";
  import NotShared from "./NotShared.svelte";
  import { weekdayDate } from "../format";

  let { clientId, name, sharing }: { clientId: string; name: string; sharing: Sharing } = $props();

  const DAY = 86_400_000;
  let sessions = $state<WorkoutSession[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let open = $state<string | null>(null);

  onMount(async () => {
    if (!sharing.workouts) return;
    try {
      const all = await getWebDeps(clientId).workoutRepo.listAllSessions();
      sessions = all.filter((s) => s.endedAtMs != null).sort((a, b) => b.startedAtMs - a.startedAtMs);
      open = sessions[0]?.id ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load their workouts";
    } finally {
      loading = false;
    }
  });

  const recent = $derived(sessions.filter((s) => s.startedAtMs >= Date.now() - 28 * DAY));
  const prs = $derived<Map<string, HistoryPR[]>>(historyPRs(sessions));

  // Main lifts: the three exercises trained most in the last 12 weeks, best estimated 1RM per
  // session, oldest to newest.
  const lifts = $derived.by(() => {
    const since = Date.now() - 84 * DAY;
    const by = new Map<string, { t: number; e1rm: number }[]>();
    for (const s of sessions) {
      if (s.startedAtMs < since) continue;
      for (const b of s.blocks) {
        if (b.type !== "strength") continue;
        const best = bestWorkingSet((b.data as StrengthBlockData).sets);
        if (!best || best.weight <= 0) continue;
        const key = blockDisplayName(b);
        const list = by.get(key) ?? [];
        list.push({ t: s.startedAtMs, e1rm: estimated1RM(best.weight, best.reps) });
        by.set(key, list);
      }
    }
    return [...by.entries()]
      .filter(([, pts]) => pts.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([lift, pts]) => {
        const sorted = pts.sort((a, b) => a.t - b.t);
        const first = sorted[0].e1rm;
        const now = Math.max(...sorted.slice(-2).map((p) => p.e1rm));
        return { lift, pts: sorted, now: Math.round(now), change: Math.round(now - first) };
      });
  });

  function spark(pts: { e1rm: number }[]): string {
    const lo = Math.min(...pts.map((p) => p.e1rm));
    const hi = Math.max(...pts.map((p) => p.e1rm));
    return pts.map((p, i) => `${(i / Math.max(1, pts.length - 1)) * 90},${hi === lo ? 12 : 21 - ((p.e1rm - lo) / (hi - lo)) * 18}`).join(" ");
  }

  function setsText(sets: StrengthBlockData["sets"]): string {
    const done = sets.filter((s) => s.completed !== false && (s.reps ?? 0) > 0);
    return done.map((s) => (s.weight ? `${s.weight} × ${s.reps}` : `${s.reps}`)).join(", ") || "–";
  }

  function openIn(path: string) {
    viewingClient.set(clientId);
    void goto(path);
  }
</script>

{#if !sharing.workouts}
  <NotShared {name} what="their workouts" note="You can still assign them programs." />
{:else if error}
  <p class="text-sm text-destructive">{error}</p>
{:else if loading}
  <div class="flex flex-wrap gap-4"><Skeleton class="h-80 flex-[2_1_520px]" /><Skeleton class="h-56 flex-[1_1_300px]" /></div>
{:else}
  <div class="flex flex-wrap items-start gap-4">
    <section class="min-w-0 flex-[2_1_520px] rounded-[10px] border border-border bg-card px-1.5 py-2">
      <div class="flex items-baseline justify-between px-3 pb-1 pt-2">
        <h2 class="text-sm font-semibold">Sessions</h2>
        <span class="text-xs text-muted-foreground">Last 4 weeks · {recent.length}</span>
      </div>
      <div class="overflow-x-auto">
        <Table.Root class="w-full min-w-[520px] border-collapse text-[13px]">
          <Table.Header><Table.Row class="text-left text-xs text-muted-foreground"><Table.Head class="px-3 py-2 font-medium">Date</Table.Head><Table.Head class="px-3 py-2 font-medium">Workout</Table.Head><Table.Head class="px-3 py-2 font-medium">Time</Table.Head><Table.Head class="px-3 py-2 font-medium">Volume</Table.Head><Table.Head></Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each recent as s (s.id)}
              {@const p = prs.get(s.id) ?? []}
              <Table.Row class="border-t border-border align-top {open === s.id ? 'bg-muted/60' : ''}">
                <Table.Cell class="whitespace-nowrap px-3 py-2.5">{weekdayDate(s.startedAtMs)}</Table.Cell>
                <Table.Cell class="px-3 py-2.5">
                  <button type="button" class="text-left font-medium hover:underline" aria-expanded={open === s.id} onclick={() => (open = open === s.id ? null : s.id)}>{sessionTitle(s)}</button>
                  {#if open === s.id}
                    <div class="flex flex-col gap-1 pt-2 text-[12.5px]">
                      {#each s.blocks as b (b.id)}
                        {#if b.type === "strength"}
                          <span><span class="font-medium">{blockDisplayName(b)}</span> <span class="text-muted-foreground">{setsText((b.data as StrengthBlockData).sets)}</span></span>
                        {:else}
                          <span class="text-muted-foreground">{blockDisplayName(b)}</span>
                        {/if}
                      {/each}
                      {#if s.note}<span class="italic text-muted-foreground">Note: "{s.note}"</span>{/if}
                    </div>
                  {/if}
                </Table.Cell>
                <Table.Cell class="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{s.endedAtMs && s.endedAtMs > s.startedAtMs ? `${Math.round((s.endedAtMs - s.startedAtMs) / 60_000)} min` : ""}</Table.Cell>
                <Table.Cell class="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{(sessionVolumeKg(s) / 1000).toFixed(1)} t</Table.Cell>
                <Table.Cell class="px-3 py-2.5">{#if p.length}<span class="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">{p.length === 1 ? "PR" : `${p.length} PRs`}</span>{/if}</Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={5} class="px-3 py-6 text-center text-muted-foreground">No workouts in the last 4 weeks.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </section>

    <div class="flex flex-[1_1_300px] flex-col gap-4">
      <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex items-baseline justify-between pb-1.5"><h2 class="text-sm font-semibold">Main lifts</h2><span class="text-xs text-muted-foreground">Estimated 1RM · 12 weeks</span></div>
        {#each lifts as l (l.lift)}
          <div class="flex items-center justify-between gap-3 border-t border-border py-2.5">
            <span class="min-w-0 flex-1 truncate text-[13px]">{l.lift}</span>
            <svg width="90" height="24" viewBox="0 0 90 24" role="img" aria-label="{l.lift} trend"><polyline points={spark(l.pts)} fill="none" stroke="currentColor" stroke-width="1.6" class="text-muted-foreground"></polyline></svg>
            <span class="whitespace-nowrap text-[13px] font-semibold">{l.now} kg <span class="text-xs font-normal {l.change > 0 ? 'text-success' : 'text-muted-foreground'}">{l.change > 0 ? `+${l.change}` : l.change === 0 ? "±0" : `${l.change}`}</span></span>
          </div>
        {:else}
          <p class="border-t border-border py-3 text-[13px] text-muted-foreground">Not enough lifting yet to show a trend.</p>
        {/each}
      </section>
      <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">See more</h2>
        <p class="text-xs text-muted-foreground">Open {name}'s pages the way they see them. A bar at the top takes you back.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick={() => openIn("/sessions")} class="h-8 rounded-[9px] border border-border px-3 text-xs font-medium hover:bg-muted">All sessions</button>
          <button type="button" onclick={() => openIn("/progress")} class="h-8 rounded-[9px] border border-border px-3 text-xs font-medium hover:bg-muted">Progress</button>
        </div>
      </section>
    </div>
  </div>
{/if}
