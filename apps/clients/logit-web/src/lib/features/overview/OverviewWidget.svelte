<script lang="ts">
  import type { OverviewData } from "./overviewData";
  import TrainOnPhone from "./TrainOnPhone.svelte";
  import type { BuiltinWidgetId } from "./layout.svelte";

  // One Overview widget's content. The frame (title, edit controls) is drawn by the page.
  const { id, data }: { id: BuiltinWidgetId; data: OverviewData } = $props();

  const tonnes = (kg: number) => `${(kg / 1000).toFixed(kg >= 10000 ? 1 : 2).replace(/\.?0+$/, "")} t`;
  const dayMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const shortDay = (ms: number) => {
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days < 1) return "Today";
    if (days < 2) return "Yesterday";
    if (days < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
    return dayMonth(ms);
  };

  const volumeChange = $derived(
    data.lastWeekVolumeKg > 0 ? Math.round(((data.thisWeekVolumeKg - data.lastWeekVolumeKg) / data.lastWeekVolumeKg) * 100) : null,
  );
  const maxWeekKg = $derived(Math.max(1, ...data.weeklyVolume.map((w) => w.kg)));
  const thisWeek = $derived(data.streak.thisWeek);
  const recent = $derived(data.sessions.slice(0, 5));
</script>

{#if id === "streak"}
  <div class="flex flex-col gap-1">
    <span class="text-2xl font-bold tracking-tight">{data.streak.currentWeeks} {data.streak.currentWeeks === 1 ? "week" : "weeks"}</span>
    {#if data.streak.pausedNow}
      <span class="text-xs text-muted-foreground">Paused</span>
    {:else if thisWeek.outcome === "met"}
      <span class="text-xs text-success">Target met this week</span>
    {:else}
      <span class="text-xs text-muted-foreground">Best: {data.streak.bestWeeks} weeks</span>
    {/if}
  </div>
{:else if id === "sessions-week"}
  <div class="flex flex-col gap-2">
    <span class="text-2xl font-bold tracking-tight">{thisWeek.done} <span class="text-base font-medium text-muted-foreground">of {thisWeek.needed || data.streak.weeklyTarget}</span></span>
    <span class="block h-1.5 rounded-full bg-muted">
      <span class="block h-1.5 rounded-full bg-primary" style="width: {Math.min(100, (thisWeek.done / Math.max(1, thisWeek.needed || data.streak.weeklyTarget)) * 100)}%"></span>
    </span>
  </div>
{:else if id === "volume-week"}
  <div class="flex flex-col gap-1">
    <span class="text-2xl font-bold tracking-tight">{tonnes(data.thisWeekVolumeKg)}</span>
    {#if volumeChange != null}
      <span class="text-xs {volumeChange >= 0 ? 'text-success' : 'text-muted-foreground'}">{volumeChange >= 0 ? "+" : ""}{volumeChange}% on last week</span>
    {:else}
      <span class="text-xs text-muted-foreground">Nothing last week to compare</span>
    {/if}
  </div>
{:else if id === "body-weight"}
  {#if data.weight?.currentKg != null}
    <div class="flex flex-col gap-1">
      <span class="text-2xl font-bold tracking-tight">{data.weight.currentKg.toFixed(1)} kg</span>
      <span class="text-xs text-muted-foreground">{data.weight.weeklyRateKg >= 0 ? "+" : "−"}{Math.abs(data.weight.weeklyRateKg).toFixed(1)} kg a week</span>
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">Log your weight in the app to see the trend.</p>
  {/if}
{:else if id === "this-week"}
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-7">
      {#each data.week as d (d.dateIso)}
        <div class="flex items-center gap-3 rounded-lg px-3 py-2 text-left sm:min-h-[78px] sm:flex-col sm:items-start sm:gap-1 sm:p-2
          {d.status === 'done' ? 'bg-muted' : d.isToday ? 'border-[1.5px] border-primary' : 'border border-dashed border-border'}">
          <span class="w-11 shrink-0 text-[11px] sm:w-auto {d.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}">{d.isToday ? "Today" : d.label}</span>
          <span class="min-w-0 flex-1 truncate text-[13px] sm:w-full sm:flex-none {d.status === 'done' || d.status === 'planned' ? 'font-semibold' : 'text-muted-foreground'}">{d.title ?? ""}</span>
          {#if d.status === "done"}<span class="text-[11px] text-success">Done{d.minutes ? ` · ${d.minutes} min` : ""}</span>
          {:else if d.status === "planned"}<span class="text-[11px] text-muted-foreground">Planned</span>{/if}
        </div>
      {/each}
    </div>
    {#if data.nextUp}
      <p class="text-xs text-muted-foreground">Next up: <span class="text-foreground">{data.nextUp.title}</span> · {data.nextUp.exercises.slice(0, 4).join(", ")}{data.nextUp.exercises.length > 4 ? "…" : ""}</p>
    {:else if !data.splitName}
      <p class="text-xs text-muted-foreground">Pick an active split in the app to see what's planned.</p>
    {/if}
    <TrainOnPhone nextTitle={data.nextUp?.title ?? null} />
  </div>
{:else if id === "goals"}
  {#if data.goals.length === 0}
    <p class="text-sm text-muted-foreground">No goals yet. Set them in the app under Progress › Goals.</p>
  {:else}
    <div class="flex flex-col gap-3.5">
      {#each data.goals as g (g.id)}
        <div class="flex flex-col gap-1.5">
          <div class="flex justify-between gap-2 text-[13px]"><span class="truncate">{g.title}</span><span class="shrink-0 text-muted-foreground">{g.currentText}</span></div>
          <span class="block h-1.5 rounded-full bg-muted"><span class="block h-1.5 rounded-full bg-chart-1" style="width: {Math.round(g.progress * 100)}%"></span></span>
          <span class="text-[11px] text-muted-foreground">{g.note}</span>
        </div>
      {/each}
    </div>
  {/if}
{:else if id === "weekly-volume"}
  <div class="flex flex-col gap-2">
    <div class="flex h-44 items-end gap-1.5 border-b border-border" role="img"
      aria-label="Weekly volume for the last 12 weeks, this week {tonnes(data.thisWeekVolumeKg)}">
      {#each data.weeklyVolume as w, i (w.weekIso)}
        <span class="flex-1 rounded-t {i === data.weeklyVolume.length - 1 ? 'bg-chart-1' : 'bg-chart-1/55'}"
          style="height: {Math.max(w.kg > 0 ? 2 : 0, (w.kg / maxWeekKg) * 100)}%" title="{dayMonth(Date.parse(w.weekIso))}: {tonnes(w.kg)}"></span>
      {/each}
    </div>
    <div class="flex justify-between text-[11px] text-muted-foreground">
      <span>{dayMonth(Date.parse(data.weeklyVolume[0]?.weekIso ?? ""))}</span>
      <span>This week (so far)</span>
    </div>
  </div>
{:else if id === "records"}
  {#if data.records.length === 0}
    <p class="text-sm text-muted-foreground">No records yet. Beat a previous best and it shows up here.</p>
  {:else}
    <ul class="flex flex-col">
      {#each data.records as r, i (i)}
        <li class="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-t-0">
          <span class="min-w-0 truncate">{r.exerciseName} <span class="text-muted-foreground">{r.weight} kg × {r.reps}</span></span>
          <span class="shrink-0 text-xs text-muted-foreground">{shortDay(r.atMs)}</span>
        </li>
      {/each}
    </ul>
  {/if}
{:else if id === "recent-sessions"}
  {#if recent.length === 0}
    <p class="text-sm text-muted-foreground">No workouts synced yet.</p>
  {:else}
    <ul class="flex flex-col">
      {#each recent as s (s.id)}
        <li class="border-t border-border first:border-t-0">
          <a href="/sessions?id={s.id}" class="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:text-foreground">
            <span class="min-w-0 truncate"><span class="font-medium">{data.titles.get(s.id) ?? "Workout"}</span> <span class="text-muted-foreground">· {shortDay(s.startedAtMs)}</span></span>
            {#if (s.endedAtMs ?? s.startedAtMs) > s.startedAtMs}<span class="shrink-0 text-xs text-muted-foreground">{Math.round(((s.endedAtMs ?? s.startedAtMs) - s.startedAtMs) / 60000)} min</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{:else if id === "habits"}
  {#if data.habits.length === 0}
    <p class="text-sm text-muted-foreground">No habits yet. Add them in the app.</p>
  {:else}
    <div class="grid grid-cols-[minmax(64px,1fr)_repeat(7,14px)] items-center gap-x-1 gap-y-2 overflow-x-auto text-[13px]">
      <span></span>
      {#each ["M", "T", "W", "T", "F", "S", "S"] as l, i (i)}<span class="text-center text-[10px] text-muted-foreground">{l}</span>{/each}
      {#each data.habits as h (h.id)}
        <span class="truncate">{h.name}</span>
        {#each h.days as d, i (i)}
          <span class="h-4 rounded {d === true ? 'bg-success' : d === false ? 'bg-muted' : ''}" aria-label={d === true ? "done" : d === false ? "not done" : "not due"}></span>
        {/each}
      {/each}
    </div>
  {/if}
{/if}
