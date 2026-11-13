<script lang="ts">
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import { Search, X, Dumbbell } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { sessionHistory, type HistoryEntry } from "$lib/features/sessions/history";
  import SessionCalendar from "$lib/features/sessions/SessionCalendar.svelte";
  import SessionCard from "$lib/features/sessions/SessionCard.svelte";
  import { volumeLabel } from "$lib/features/sessions/format";
  import { loadWeeklyStreak } from "$lib/features/goals/streak";
  import type { WeeklyStreak } from "@logit/core/domain/weeklyStreak";
  import { sessionMatches } from "@logit/core/domain/sessionHistory";
  import { splitDayName } from "@logit/core/domain/splitSchedule";
  import { localDateIso } from "@logit/core/domain/nutrition";

  const unit = $derived($profile.weightUnit);

  let error = $state<string | null>(null);
  let streak = $state<WeeklyStreak | null>(null);
  let searching = $state(false);
  let query = $state("");
  let selectedDay = $state<string | null>(null);
  let chip = $state<string | null>(null);
  let calendarExpanded = $state(true);
  let searchEl = $state<HTMLInputElement | null>(null);

  onMount(() => {
    sessionHistory.refresh().catch((e) => (error = e instanceof Error ? e.message : "Couldn't load your sessions"));
    loadWeeklyStreak().then((s) => (streak = s)).catch(() => {});
  });

  const entries = $derived($sessionHistory?.entries ?? []);
  const loading = $derived(!$sessionHistory && !error);

  const workoutsByDay = $derived.by(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.dayIso, (m.get(e.dayIso) ?? 0) + 1);
    return m;
  });

  const q = $derived(query.trim().toLowerCase());

  function matchesQuery(e: HistoryEntry): boolean {
    if (!q) return true;
    return e.title.toLowerCase().includes(q) || sessionMatches(e.session, q).length > 0 || (e.session.note ?? "").toLowerCase().includes(q);
  }

  const matchDays = $derived(q ? new Set(entries.filter(matchesQuery).map((e) => e.dayIso)) : null);

  const monthCount = $derived.by(() => {
    const prefix = localDateIso(new Date()).slice(0, 7);
    return entries.filter((e) => !e.inProgress && e.dayIso.startsWith(prefix)).length;
  });

  // Filter chips: the workouts done more than once, the active split's days first in split order.
  const chips = $derived.by(() => {
    const counts = new Map<string, number>();
    // By the day's own name, so a renamed workout still counts as its split day.
    for (const e of entries) if (e.parentName) counts.set(e.autoTitle, (counts.get(e.autoTitle) ?? 0) + 1);
    const split = $activeSplit;
    const order = split ? split.days.filter((d) => !d.rest).map((d) => splitDayName(split, d)) : [];
    const titles = [...counts.keys()].filter((t) => counts.get(t)! > 1 || order.includes(t));
    titles.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return counts.get(b)! - counts.get(a)!;
    });
    return titles.slice(0, 10);
  });

  const filtered = $derived(
    entries.filter(
      (e) => (!selectedDay || e.dayIso === selectedDay) && (!chip || e.autoTitle === chip) && matchesQuery(e),
    ),
  );

  // Weeks, then months; inside, one card per day (a second workout that day sits under it,
  // except in search results, where each match is its own card).
  type DayGroup = { key: string; entries: HistoryEntry[] };
  type Section = { key: string; label: string; count: number; volumeKg: number; days: DayGroup[] };

  function mondayIso(d: Date): string {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return localDateIso(m);
  }

  const sections = $derived.by((): Section[] => {
    const now = new Date();
    const thisWeek = mondayIso(now);
    const lastWeek = mondayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    const out: Section[] = [];
    for (const e of filtered) {
      const d = new Date(e.session.startedAtMs);
      const wk = mondayIso(d);
      const key = e.inProgress ? "now" : wk === thisWeek ? "this" : wk === lastWeek ? "last" : `${d.getFullYear()}-${d.getMonth()}`;
      const label =
        key === "now"
          ? "In progress"
          : key === "this"
            ? "This week"
            : key === "last"
              ? "Last week"
              : d.toLocaleDateString(undefined, { month: "long", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
      let sec = out.at(-1);
      if (!sec || sec.key !== key) {
        sec = { key, label, count: 0, volumeKg: 0, days: [] };
        out.push(sec);
      }
      sec.count++;
      sec.volumeKg += e.volumeKg;
      const last = sec.days.at(-1);
      // The day's first workout leads; later ones that day sit under it.
      if (!q && !e.inProgress && last && last.entries[0]!.dayIso === e.dayIso && !last.entries[0]!.inProgress) last.entries.unshift(e);
      else sec.days.push({ key: e.session.id, entries: [e] });
    }
    return out;
  });

  // Draw a page of days at a time; more as the end comes into view.
  const PAGE = 20;
  let shown = $state(PAGE);
  $effect(() => {
    void q;
    void selectedDay;
    void chip;
    shown = PAGE;
  });
  const totalDays = $derived(sections.reduce((n, s) => n + s.days.length, 0));
  const visible = $derived.by(() => {
    let left = shown;
    const out: Section[] = [];
    for (const s of sections) {
      if (left <= 0) break;
      out.push({ ...s, days: s.days.slice(0, left) });
      left -= s.days.length;
    }
    return out;
  });

  let sentinel = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = sentinel;
    if (!el) return;
    const io = new IntersectionObserver((xs) => {
      if (xs.some((x) => x.isIntersecting)) shown += PAGE;
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  });

  async function openSearch() {
    searching = true;
    calendarExpanded = false;
    await tick();
    searchEl?.focus();
  }

  function closeSearch() {
    searching = false;
    query = "";
    calendarExpanded = true;
  }

  function open(e: HistoryEntry) {
    void goto(e.inProgress ? "/session/current" : `/sessions/${e.session.id}`);
  }

  const filterLabel = $derived(
    selectedDay
      ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
      : null,
  );
</script>

<PageHeader>
  {#if searching}
    <div class="relative flex min-w-0 flex-1 items-center">
      <Search class="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <input
        bind:this={searchEl}
        bind:value={query}
        type="search"
        aria-label="Search sessions"
        placeholder="Exercise, workout or note"
        class="h-10 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
    <button type="button" class="h-11 shrink-0 px-2 text-sm font-medium" onclick={closeSearch}>Cancel</button>
  {:else}
    <h1 class="page-title">Sessions</h1>
    <button
      type="button"
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
      aria-label="Search sessions"
      onclick={() => void openSearch()}
    >
      <Search class="h-[18px] w-[18px]" />
    </button>
  {/if}
</PageHeader>

<div class="flex flex-col gap-3 p-3 pb-28">
  {#if error}
    <div class="flex flex-col gap-2 rounded-xl border p-3">
      <p class="text-sm text-destructive">{error}</p>
      <button type="button" class="w-fit text-sm underline-offset-2 hover:underline" onclick={() => { error = null; void sessionHistory.refresh(); }}>Retry</button>
    </div>
  {:else if loading}
    <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
  {:else if entries.length === 0}
    <div class="flex flex-col items-center gap-3 px-3 py-12 text-center" in:fade={{ duration: 160 }}>
      <Dumbbell class="h-6 w-6 text-muted-foreground" />
      <p class="text-sm text-muted-foreground">No workouts yet. They'll show up here with what changed each time.</p>
      <Button variant="outline" onclick={() => void goto("/session/current")}>Start your first workout</Button>
    </div>
  {:else}
    <SessionCalendar
      {workoutsByDay}
      {matchDays}
      selected={selectedDay}
      bind:expanded={calendarExpanded}
      {streak}
      {monthCount}
      onSelect={(d) => (selectedDay = d)}
    />

    {#if chips.length > 1 && !searching}
      <div class="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]" style="touch-action: pan-x">
        <button
          type="button"
          aria-pressed={!chip}
          class="h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium {!chip ? 'bg-foreground text-background' : 'border bg-card'}"
          onclick={() => (chip = null)}>All</button
        >
        {#each chips as c (c)}
          <button
            type="button"
            aria-pressed={chip === c}
            class="h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium {chip === c ? 'bg-foreground text-background' : 'border bg-card'}"
            onclick={() => (chip = chip === c ? null : c)}>{c}</button
          >
        {/each}
      </div>
    {/if}

    {#if filterLabel}
      <div class="flex items-center justify-between gap-2 px-0.5">
        <span class="text-sm font-medium">{filterLabel}</span>
        <button type="button" class="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted" onclick={() => (selectedDay = null)}>
          <X class="h-3.5 w-3.5" /> Show all days
        </button>
      </div>
    {/if}

    {#if filtered.length === 0}
      <p class="py-8 text-center text-sm text-muted-foreground">
        {q ? `Nothing with “${query.trim()}”.` : "No workouts match."}
      </p>
    {/if}

    {#each visible as sec (sec.key)}
      <div class="flex items-baseline justify-between px-0.5 pt-1">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {sec.key === "now" ? sec.label : `${sec.label} · ${sec.count} workout${sec.count === 1 ? "" : "s"}`}
        </span>
        {#if sec.volumeKg > 0 && sec.key !== "now"}
          <span class="text-xs text-muted-foreground tabular-nums">{volumeLabel(sec.volumeKg, unit)}</span>
        {/if}
      </div>
      {#each sec.days as day (day.key)}
        <SessionCard entries={day.entries} {unit} query={q} onOpen={open} />
      {/each}
    {/each}

    {#if shown < totalDays}
      <div bind:this={sentinel} class="flex justify-center py-2">
        <Button variant="ghost" size="sm" onclick={() => (shown += PAGE)}>Show more</Button>
      </div>
    {/if}
  {/if}
</div>
