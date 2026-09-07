<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Search, X, ChevronRight, Dumbbell } from "lucide-svelte";

  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { profile } from "$lib/stores/profile.store";
  import { durationMs, formatDuration } from "@logit/core/domain/time";
  import {
    getTopSetHighlight,
    getExercises,
    getSessionVolumeKg,
  } from "@logit/core/domain/workout";
  import { formatWeight } from "@logit/core/domain/units";
  import { reveal, popIn } from "$lib/transitions";
  import { fade } from "svelte/transition";

  const ui = $state({ loading: true, error: null as string | null });
  let query = $state("");

  const weightUnit = $derived($profile.weightUnit);

  const DAY = 86_400_000;

  /** Monday 00:00 of the week containing `ms`. */
  function startOfWeek(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    return d.getTime() - dow * DAY;
  }

  function relativeDate(ms: number): string {
    const now = new Date();
    const then = new Date(ms);
    const startToday = new Date(now).setHours(0, 0, 0, 0);
    const startThen = new Date(then).setHours(0, 0, 0, 0);
    const diffDays = Math.round((startToday - startThen) / DAY);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return then.toLocaleDateString(undefined, { weekday: "long" });
    const sameYear = then.getFullYear() === now.getFullYear();
    return then.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }

  function bucketOf(ms: number): string {
    const now = Date.now();
    const thisWeek = startOfWeek(now);
    if (ms >= thisWeek) return "This week";
    if (ms >= thisWeek - 7 * DAY) return "Last week";
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString(undefined, {
      month: "long",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }

  type Row = {
    id: string;
    startedAtMs: number;
    dateLabel: string;
    durationLabel: string;
    inProgress: boolean;
    exerciseCount: number;
    volumeKg: number;
    topSet: string | null;
    searchText: string;
  };

  const allRows = $derived<Row[]>(
    ($recentSessions ?? []).map((s) => {
      const ended = s.endedAtMs ?? s.startedAtMs;
      const dur = s.endedAtMs ? durationMs(s.startedAtMs, s.endedAtMs) : 0;
      const top = getTopSetHighlight(s);
      const topSet = top ? `${top.exerciseName} ${top.reps}×${formatWeight(top.weight, weightUnit)}` : null;
      return {
        id: s.id,
        startedAtMs: s.startedAtMs,
        dateLabel: relativeDate(ended),
        durationLabel: s.endedAtMs ? formatDuration(dur) : "In progress",
        inProgress: !s.endedAtMs,
        exerciseCount: getExercises(s).length,
        volumeKg: getSessionVolumeKg(s),
        topSet,
        searchText: `${relativeDate(ended)} ${new Date(ended).toLocaleDateString()} ${topSet ?? ""}`.toLowerCase(),
      };
    }),
  );

  const filteredRows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => r.searchText.includes(q));
  });

  const groups = $derived.by(() => {
    const out: { bucket: string; rows: Row[] }[] = [];
    for (const row of filteredRows) {
      const bucket = bucketOf(row.startedAtMs);
      const last = out[out.length - 1];
      if (last && last.bucket === bucket) last.rows.push(row);
      else out.push({ bucket, rows: [row] });
    }
    return out;
  });

  // Header stats — computed from what's loaded (the store keeps the last 50).
  const stats = $derived.by(() => {
    const now = Date.now();
    const weekStart = startOfWeek(now);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const finished = ($recentSessions ?? []).filter((s) => s.endedAtMs);
    const thisWeek = finished.filter((s) => s.startedAtMs >= weekStart);
    const thisMonth = finished.filter((s) => s.startedAtMs >= monthStart.getTime());
    const weekVolumeKg = thisWeek.reduce((v, s) => v + getSessionVolumeKg(s), 0);
    return {
      week: thisWeek.length,
      month: thisMonth.length,
      weekVolume: weekVolumeKg,
    };
  });

  onMount(async () => {
    ui.loading = true;
    ui.error = null;
    try {
      await recentSessions.refresh(50);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load sessions";
    } finally {
      ui.loading = false;
    }
  });
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center justify-between px-3 py-3 border-b border-border">
    <h1 class="text-base font-semibold">Sessions</h1>
  </div>

  {#if !ui.loading && !ui.error && allRows.length > 0}
    <div class="grid grid-cols-3 divide-x divide-border border-b border-border" in:fade={{ duration: 160 }}>
      <div class="px-3 py-2.5 text-center">
        <p class="text-lg font-bold tabular-nums leading-none">{stats.week}</p>
        <p class="text-[11px] text-muted-foreground mt-1">this week</p>
      </div>
      <div class="px-3 py-2.5 text-center">
        <p class="text-lg font-bold tabular-nums leading-none">{stats.month}</p>
        <p class="text-[11px] text-muted-foreground mt-1">this month</p>
      </div>
      <div class="px-3 py-2.5 text-center">
        <p class="text-lg font-bold tabular-nums leading-none">
          {stats.weekVolume > 0 ? formatWeight(stats.weekVolume, weightUnit, { withUnit: false }) : "—"}
        </p>
        <p class="text-[11px] text-muted-foreground mt-1">{weightUnit} this week</p>
      </div>
    </div>
  {/if}

  <div class="relative px-3 py-2 border-b border-border">
    <Search class="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
    <input
      type="text"
      placeholder="Search by date or exercise…"
      bind:value={query}
      class="w-full rounded border border-border bg-background pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
    {#if query}
      <button
        type="button"
        class="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onclick={() => (query = "")}
        aria-label="Clear search"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    {/if}
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if ui.error}
    <div class="px-3 py-4 flex flex-col gap-2">
      <p class="text-sm text-destructive">{ui.error}</p>
      <button
        type="button"
        class="text-sm underline-offset-2 hover:underline text-left w-fit"
        onclick={() => void recentSessions.refresh(50)}
      >
        Retry
      </button>
    </div>
  {:else if filteredRows.length === 0}
    <div class="px-3 py-12 flex flex-col items-center gap-2 text-center" in:fade={{ duration: 160 }}>
      <Dumbbell class="h-6 w-6 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground">
        {query.trim() ? "No sessions match your search." : "No sessions yet."}
      </p>
      {#if !query.trim()}
        <button
          type="button"
          class="mt-1 text-sm text-primary font-medium"
          onclick={() => void goto("/session/current")}
        >
          Start your first workout
        </button>
      {/if}
    </div>
  {:else}
    {#each groups as group (group.bucket)}
      <div transition:reveal>
        <p class="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {group.bucket}
        </p>
        <ul class="divide-y divide-border">
          {#each group.rows as s, i (s.id)}
            <li in:popIn={{ duration: 200, delay: Math.min(i * 25, 200) }}>
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors {s.inProgress ? 'bg-primary/[0.04]' : ''}"
                onclick={() => void goto(s.inProgress ? "/session/current" : `/sessions/${s.id}`)}
              >
                {#if s.inProgress}
                  <span class="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" aria-hidden="true"></span>
                {/if}
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{s.dateLabel}</span>
                    <span class="text-xs {s.inProgress ? 'text-primary font-medium' : 'text-muted-foreground'}">{s.durationLabel}</span>
                  </div>
                  {#if !s.inProgress}
                    <p class="text-xs text-muted-foreground mt-0.5 truncate">
                      {s.exerciseCount} exercise{s.exerciseCount === 1 ? "" : "s"}{s.volumeKg > 0 ? ` · ${formatWeight(s.volumeKg, weightUnit)}` : ""}{s.topSet ? ` · ${s.topSet}` : ""}
                    </p>
                  {/if}
                </div>
                {#if s.inProgress}
                  <span class="text-xs font-semibold text-primary shrink-0">Resume</span>
                {:else}
                  <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}
</div>
