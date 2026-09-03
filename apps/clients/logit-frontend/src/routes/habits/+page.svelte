<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Plus, Check, Flame, CalendarCheck, ChevronDown } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { onForeground } from "$lib/lifecycle";
  import { getHabitRepo, getAssignedHabitRepo } from "$lib/data/repoProvider";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { addDays } from "@logit/core/domain/dateIso";
  import {
    computeStreak,
    createHabitEntry,
    dueOn,
    isSatisfied,
    weekProgress,
    type Habit,
    type HabitEntry,
  } from "@logit/core/domain/habit";
  import { coachHabitAsHabit } from "@logit/core/domain/CoachHabit";
  import { bumpHabits } from "$lib/features/habits/store";
  import { pushHabit, pushHabitEntry } from "$lib/sync/syncService";

  type Row = {
    habit: Habit;
    entry: HabitEntry | undefined;
    due: boolean;
    satisfied: boolean;
    streak: number;
    week: { done: number; target: number } | null;
    /** Set for a coach-assigned habit — read-only, shows a "From your coach" note. */
    note?: string;
  };

  const ui = $state({ loading: true, error: null as string | null, showArchived: false });
  let rows = $state<Row[]>([]);
  let coachRows = $state<Row[]>([]);
  let archived = $state<Habit[]>([]);
  const today = localDateIso();

  const dueRows = $derived([...rows, ...coachRows].filter((r) => r.due));
  const doneCount = $derived(dueRows.filter((r) => r.satisfied).length);

  function buildRow(habit: Habit, entries: HabitEntry[], note?: string): Row {
    const hEntries = entries.filter((e) => e.habitId === habit.id);
    const entry = hEntries.find((e) => e.dateIso === today);
    return {
      habit,
      entry,
      due: dueOn(habit, today),
      satisfied: isSatisfied(habit, entry),
      streak: computeStreak(habit, hEntries, today),
      week: weekProgress(habit, hEntries, today),
      note,
    };
  }

  async function load() {
    ui.error = null;
    try {
      const repo = getHabitRepo();
      const [all, assigned] = await Promise.all([
        repo.listHabits({ includeArchived: true }),
        getAssignedHabitRepo().listAssignedHabits(),
      ]);
      const habits = all.filter((h) => !h.archived);
      archived = all.filter((h) => h.archived);
      const entries = await repo.listEntries({ fromIso: addDays(today, -120), toIso: today });
      rows = habits.map((habit) => buildRow(habit, entries));
      coachRows = assigned.map((ch) =>
        buildRow(coachHabitAsHabit(ch), entries, ch.note?.trim() || undefined),
      );
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load habits";
    } finally {
      ui.loading = false;
    }
  }

  async function toggle(row: Row) {
    const repo = getHabitRepo();
    const next = !row.satisfied;
    const patch: Partial<HabitEntry> = { ...(row.entry ?? {}), done: next };
    if (row.habit.target) patch.value = next ? row.habit.target.value : 0;
    const entry = createHabitEntry(row.habit.id, today, patch);
    await repo.saveEntry(entry);
    pushHabitEntry(entry);
    bumpHabits();
    await load();
  }

  async function restore(h: Habit) {
    const repo = getHabitRepo();
    await repo.unarchiveHabit(h.id);
    const updated = await repo.getHabit(h.id);
    if (updated) pushHabit(updated);
    bumpHabits();
    await load();
  }

  function cadenceLabel(h: Habit): string {
    if (h.cadence.kind === "daily") return "Every day";
    if (h.cadence.kind === "weekly") return `${h.cadence.timesPerWeek}× per week`;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return h.cadence.days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => names[d])
      .join(" · ");
  }

  onMount(() => void load());
  onMount(() => onForeground(() => void load()));
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 border-b border-border px-3 py-2">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center"
      onclick={() => back("/")}
    >
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Habits</h1>
    <button
      type="button"
      class="ml-auto flex h-8 w-8 items-center justify-center"
      aria-label="New habit"
      onclick={() => void goto("/habits/new")}
    >
      <Plus class="h-4 w-4" />
    </button>
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#snippet habitRow(row: Row, readonly: boolean)}
    <li class="flex items-center gap-3 px-3 py-3 {row.due ? '' : 'opacity-45'}">
      <button
        type="button"
        aria-label={row.satisfied ? "Mark not done" : "Mark done"}
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors {row.satisfied
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40'}"
        onclick={() => void toggle(row)}
      >
        {#if row.satisfied}<Check class="h-4 w-4" />{/if}
      </button>
      {#snippet label()}
        <span
          class="block truncate text-sm font-medium {row.satisfied
            ? 'text-muted-foreground line-through'
            : ''}"
        >
          {#if row.habit.icon}{row.habit.icon}&nbsp;{/if}{row.habit.name}
        </span>
        <span class="text-xs text-muted-foreground">
          {cadenceLabel(row.habit)}
          {#if row.habit.target}· {row.habit.target.value}{row.habit.target.unit
              ? ` ${row.habit.target.unit}`
              : ""}/day{/if}
        </span>
        {#if row.note}
          <span class="mt-0.5 block text-xs text-muted-foreground italic">{row.note}</span>
        {/if}
      {/snippet}
      {#if readonly}
        <div class="min-w-0 flex-1 text-left">{@render label()}</div>
      {:else}
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          onclick={() => void goto(`/habits/${row.habit.id}`)}
        >
          {@render label()}
        </button>
      {/if}
      <div class="shrink-0 text-right">
        {#if row.week}
          <span class="text-xs font-medium">{row.week.done}/{row.week.target}</span>
          <span class="block text-[10px] text-muted-foreground">this week</span>
        {:else if row.streak > 0}
          <span class="flex items-center gap-0.5 text-xs font-medium">
            <Flame class="h-3 w-3" />{row.streak}
          </span>
          <span class="block text-[10px] text-muted-foreground">
            day{row.streak === 1 ? "" : "s"}
          </span>
        {/if}
      </div>
    </li>
  {/snippet}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if rows.length === 0 && coachRows.length === 0}
    <div
      class="flex flex-col items-center gap-3 px-3 py-14 text-center text-muted-foreground"
    >
      <CalendarCheck class="h-6 w-6" />
      <p class="text-sm">No habits yet.</p>
      <button
        type="button"
        class="text-sm text-primary"
        onclick={() => void goto("/habits/new")}
      >
        Add your first habit
      </button>
    </div>
  {:else}
    {#if dueRows.length > 0}
      <p class="px-3 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        {doneCount} / {dueRows.length} done today
      </p>
    {/if}

    {#if coachRows.length > 0}
      <p class="px-3 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        From your coach
      </p>
      <ul class="divide-y divide-border">
        {#each coachRows as row (row.habit.id)}
          {@render habitRow(row, true)}
        {/each}
      </ul>
    {/if}

    {#if rows.length > 0}
      {#if coachRows.length > 0}
        <p class="px-3 pt-4 text-[11px] uppercase tracking-wide text-muted-foreground">
          Your habits
        </p>
      {/if}
      <ul class="divide-y divide-border">
        {#each rows as row (row.habit.id)}
          {@render habitRow(row, false)}
        {/each}
      </ul>
    {/if}
  {/if}

  {#if archived.length > 0}
    <div class="mt-6 border-t border-border">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground"
        onclick={() => (ui.showArchived = !ui.showArchived)}
      >
        <span>Archived ({archived.length})</span>
        <ChevronDown
          class="h-4 w-4 transition-transform {ui.showArchived ? 'rotate-180' : ''}"
        />
      </button>
      {#if ui.showArchived}
        <ul class="divide-y divide-border">
          {#each archived as h (h.id)}
            <li class="flex items-center gap-3 px-3 py-3">
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                onclick={() => void goto(`/habits/${h.id}`)}
              >
                <span class="block truncate text-sm font-medium text-muted-foreground">
                  {#if h.icon}{h.icon}&nbsp;{/if}{h.name}
                </span>
                <span class="text-xs text-muted-foreground">{cadenceLabel(h)}</span>
              </button>
              <button
                type="button"
                class="shrink-0 text-xs font-medium text-primary"
                onclick={() => void restore(h)}
              >
                Restore
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
