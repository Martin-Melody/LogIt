<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { getWebDeps } from "$lib/deps";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import {
    blockDisplayName,
    type SessionBlock,
    type StrengthBlockData,
    type WorkoutSession,
  } from "@logit/core/domain/workout";
  import {
    bestWorkingSet,
    compareSessions,
    historyPRs,
    sessionMatches,
    sessionTitle,
    type HistoryPR,
    type SessionComparison,
  } from "@logit/core/domain/sessionHistory";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";
  import { weekStartIso } from "@logit/core/domain/dateIso";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { sessionVolumeKg } from "$lib/features/overview/overviewData";

  // Every workout, readable on a big screen: a list by week on the left, the chosen one on
  // the right. Read-only: workouts are logged on the phone.

  let sessions = $state<WorkoutSession[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state("");

  async function load(clientId: string | null) {
    loading = true;
    error = null;
    try {
      const all = await getWebDeps(clientId ?? undefined).workoutRepo.listAllSessions();
      sessions = all.filter((s) => s.endedAtMs != null).sort((a, b) => b.startedAtMs - a.startedAtMs);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your sessions.";
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    void load(viewingClient.id);
  });

  const comparisons = $derived<Map<string, SessionComparison>>(compareSessions(sessions));
  const prs = $derived<Map<string, HistoryPR[]>>(historyPRs(sessions));
  const filtered = $derived(query.trim() ? sessions.filter((s) => sessionMatches(s, query).length > 0 || sessionTitle(s).toLowerCase().includes(query.trim().toLowerCase())) : sessions);

  const todayIso = localDateIso(new Date());
  const thisWeek = weekStartIso(todayIso);
  function weekLabel(weekIso: string): string {
    if (weekIso === thisWeek) return "This week";
    const lastWeek = weekStartIso(localDateIso(new Date(Date.now() - 7 * 86_400_000)));
    if (weekIso === lastWeek) return "Last week";
    return `Week of ${new Date(weekIso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  }
  const groups = $derived.by(() => {
    const out: { label: string; items: WorkoutSession[] }[] = [];
    for (const s of filtered) {
      const label = weekLabel(weekStartIso(localDateIso(new Date(s.startedAtMs))));
      const last = out.at(-1);
      if (last?.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  });

  const selectedId = $derived(page.url.searchParams.get("id") ?? filtered[0]?.id ?? null);
  const selected = $derived(sessions.find((s) => s.id === selectedId) ?? null);

  let detailEl = $state<HTMLElement | null>(null);
  async function select(id: string) {
    await goto(`/sessions?id=${id}`, { replaceState: true, noScroll: true, keepFocus: true });
    // On a phone the details sit below the list.
    if (detailEl && window.innerWidth < 900) detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const minutes = (s: WorkoutSession) => Math.round(((s.endedAtMs ?? s.startedAtMs) - s.startedAtMs) / 60000);
  const tonnes = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
  const dateLine = (s: WorkoutSession) =>
    new Date(s.startedAtMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const kg = (n: number) => `${Math.round(n * 100) / 100}`;

  function workingSets(b: SessionBlock) {
    return (b.data as StrengthBlockData).sets.filter((s) => (!s.setType || s.setType === "normal") && s.completed !== false && s.reps > 0);
  }
  function setsText(b: SessionBlock): string {
    if (b.type !== "strength") return "";
    return workingSets(b).map((s) => (s.weight > 0 ? `${kg(s.weight)} × ${s.reps}` : `${s.reps} reps`)).join(" · ");
  }
  function changeText(sessionId: string, blockId: string): { text: string; tone: string } | null {
    const c = comparisons.get(sessionId)?.byBlockId[blockId];
    if (!c || c.kind === "new") return c ? { text: "First time", tone: "text-muted-foreground" } : null;
    if (c.kind === "same") return { text: "Same as last time", tone: "text-muted-foreground" };
    const parts: string[] = [];
    if (c.weightDelta) parts.push(`${c.weightDelta > 0 ? "+" : "−"}${kg(Math.abs(c.weightDelta))} kg`);
    if (c.repsDelta) parts.push(`${c.repsDelta > 0 ? "+" : "−"}${Math.abs(c.repsDelta)} rep${Math.abs(c.repsDelta) === 1 ? "" : "s"}`);
    return { text: parts.join(", ") || (c.kind === "up" ? "Better" : "Lower"), tone: c.kind === "up" ? "text-success" : "text-muted-foreground" };
  }
  const workingSetCount = (s: WorkoutSession) => s.blocks.filter((b) => b.type === "strength").reduce((n, b) => n + workingSets(b).length, 0);
  const ordered = (s: WorkoutSession) => [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-[26px] font-bold tracking-tight">Sessions</h1>
    <div>
      <label for="session-search" class="sr-only">Search sessions</label>
      <input id="session-search" type="search" placeholder="Search exercise or workout" bind:value={query}
        class="h-9 w-64 max-w-full rounded-[10px] border border-input bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
    </div>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-96 flex-[1_1_300px]" /><Skeleton class="h-96 flex-[999_1_520px]" /></div>
  {:else if sessions.length === 0}
    <p class="rounded-[10px] border border-border bg-card p-6 text-sm text-muted-foreground">No workouts synced yet. Log one in the app and it appears here.</p>
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <nav aria-label="Sessions" class="flex max-h-[calc(100svh-9rem)] flex-[1_1_300px] flex-col overflow-y-auto rounded-[10px] border border-border bg-card p-1.5">
        {#if groups.length === 0}<p class="p-4 text-sm text-muted-foreground">No sessions match “{query}”.</p>{/if}
        {#each groups as g (g.label)}
          <p class="px-3.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
          {#each g.items as s (s.id)}
            {@const prCount = prs.get(s.id)?.length ?? 0}
            <button type="button" onclick={() => void select(s.id)} aria-current={s.id === selectedId ? "true" : undefined}
              class="flex flex-col gap-0.5 rounded-lg px-3.5 py-3 text-left {s.id === selectedId ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
              <span class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-semibold">{sessionTitle(s)}</span>
                {#if prCount > 0}<span class="shrink-0 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">{prCount} PR{prCount === 1 ? "" : "s"}</span>{/if}
              </span>
              <span class="text-xs text-muted-foreground">{dateLine(s)} · {minutes(s)} min · {tonnes(sessionVolumeKg(s))}</span>
            </button>
          {/each}
        {/each}
      </nav>

      {#if selected}
        {@const sessionPrs = prs.get(selected.id) ?? []}
        <section bind:this={detailEl} class="flex min-w-0 flex-[999_1_520px] scroll-mt-14 flex-col gap-4 rounded-[10px] border border-border bg-card px-[22px] py-5">
          <div>
            <h2 class="text-xl font-bold">{sessionTitle(selected)}</h2>
            <p class="mt-1 text-[13px] text-muted-foreground">
              {new Date(selected.startedAtMs).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              · {new Date(selected.startedAtMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}–{new Date(selected.endedAtMs ?? selected.startedAtMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              {#if selected.source}· {selected.source.parentName}{/if}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div class="rounded-lg bg-muted p-3"><div class="text-lg font-bold">{minutes(selected)} min</div><div class="text-xs text-muted-foreground">Duration</div></div>
            <div class="rounded-lg bg-muted p-3"><div class="text-lg font-bold">{workingSetCount(selected)}</div><div class="text-xs text-muted-foreground">Working sets</div></div>
            <div class="rounded-lg bg-muted p-3"><div class="text-lg font-bold">{tonnes(sessionVolumeKg(selected))}</div><div class="text-xs text-muted-foreground">Volume</div></div>
            <div class="rounded-lg bg-muted p-3"><div class="text-lg font-bold {sessionPrs.length ? 'text-warning' : ''}">{sessionPrs.length}</div><div class="text-xs text-muted-foreground">Records</div></div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full min-w-[540px] border-collapse text-[13px]">
              <thead>
                <tr class="text-left text-xs text-muted-foreground">
                  <th class="px-2.5 py-2 font-medium">Exercise</th>
                  <th class="px-2.5 py-2 font-medium">Sets</th>
                  <th class="px-2.5 py-2 font-medium">Best set</th>
                  <th class="px-2.5 py-2 font-medium">e1RM</th>
                  <th class="px-2.5 py-2 font-medium">vs last time</th>
                </tr>
              </thead>
              <tbody>
                {#each ordered(selected) as b (b.id)}
                  {@const best = b.type === "strength" ? bestWorkingSet((b.data as StrengthBlockData).sets) : null}
                  {@const change = changeText(selected.id, b.id)}
                  {@const isPr = sessionPrs.some((p) => p.blockId === b.id)}
                  <tr class="border-t border-border align-top">
                    <td class="px-2.5 py-2.5 font-medium">
                      {#if b.type === "strength" && (b.data as StrengthBlockData).exerciseId}
                        <a href="/exercises/{(b.data as StrengthBlockData).exerciseId}" class="hover:underline">{blockDisplayName(b)}</a>
                      {:else}{blockDisplayName(b)}{/if}
                      {#if isPr}<span class="ml-1.5 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">PR</span>{/if}
                    </td>
                    <td class="px-2.5 py-2.5 text-muted-foreground">{b.type === "strength" ? setsText(b) : b.type === "cardio" ? "Cardio" : "Mobility"}</td>
                    <td class="px-2.5 py-2.5">{best ? (best.weight > 0 ? `${kg(best.weight)} kg × ${best.reps}` : `${best.reps} reps`) : "—"}</td>
                    <td class="px-2.5 py-2.5">{best && best.weight > 0 ? `${kg(Math.round(estimated1RM(best.weight, best.reps) * 10) / 10)} kg` : "—"}</td>
                    <td class="px-2.5 py-2.5 {change?.tone ?? ''}">{change?.text ?? ""}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          {#if selected.note?.trim()}
            <div class="flex flex-col gap-1.5">
              <h3 class="text-[13px] font-semibold">Notes</h3>
              <p class="text-[13px] leading-relaxed text-muted-foreground">{selected.note}</p>
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>
