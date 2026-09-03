<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { getHabitRepo } from "$lib/data/repoProvider";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { addDays } from "@logit/core/domain/dateIso";
  import {
    adherence,
    computeStreak,
    type Habit,
    type HabitEntry,
  } from "@logit/core/domain/habit";
  import { bumpHabits } from "$lib/features/habits/store";
  import HabitEditor from "$lib/features/habits/HabitEditor.svelte";

  const id = $derived($page.params.id ?? "");

  const ui = $state({ loading: true, error: null as string | null, deleting: false });
  let habit = $state<Habit | null>(null);
  let entries = $state<HabitEntry[]>([]);
  const today = localDateIso();

  const streak = $derived(habit ? computeStreak(habit, entries, today) : 0);
  const month = $derived(
    habit ? adherence(habit, entries, addDays(today, -29), today) : null,
  );

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const repo = getHabitRepo();
      habit = await repo.getHabit(id);
      if (!habit) {
        ui.error = "Habit not found";
        return;
      }
      entries = await repo.listEntries({ habitId: id, fromIso: addDays(today, -120), toIso: today });
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load habit";
    } finally {
      ui.loading = false;
    }
  }

  // Edit mode auto-saves: persist and stay put (the back arrow leaves).
  async function save(next: Habit) {
    await getHabitRepo().saveHabit(next);
    bumpHabits();
  }

  async function archive() {
    if (!habit) return;
    await getHabitRepo().archiveHabit(habit.id);
    bumpHabits();
    await goto("/habits", { replaceState: true });
  }

  async function unarchive() {
    if (!habit) return;
    await getHabitRepo().unarchiveHabit(habit.id);
    bumpHabits();
    await goto("/habits", { replaceState: true });
  }

  async function remove() {
    if (!habit) return;
    ui.deleting = true;
    try {
      await getHabitRepo().deleteHabit(habit.id);
      bumpHabits();
      await goto("/habits", { replaceState: true });
    } finally {
      ui.deleting = false;
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 border-b border-border px-3 py-2">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center"
      onclick={() => back("/habits")}
    >
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">
      {habit?.name ?? "Edit habit"}
    </h1>

    {#if habit}
      {#if habit.archived}
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center text-muted-foreground"
          aria-label="Restore habit"
          onclick={unarchive}
        >
          <ArchiveRestore class="h-4 w-4" />
        </button>
      {:else}
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center text-muted-foreground"
          aria-label="Archive habit"
          onclick={archive}
        >
          <Archive class="h-4 w-4" />
        </button>
      {/if}
      <ConfirmDialog
        title={`Delete "${habit.name}"?`}
        description="Removes the habit and its check-off history. This cannot be undone."
        confirmLabel="Delete"
        saving={ui.deleting}
        onConfirm={remove}
      >
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-destructive"
            aria-label="Delete habit"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        {/snippet}
      </ConfirmDialog>
    {/if}
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {:else if habit}
    <div class="flex gap-4 border-b border-border px-3 py-3 text-center">
      <div class="flex-1">
        <span class="block text-lg font-semibold">{streak}</span>
        <span class="text-[11px] text-muted-foreground">day streak</span>
      </div>
      {#if month}
        <div class="flex-1">
          <span class="block text-lg font-semibold">{Math.round(month.pct * 100)}%</span>
          <span class="text-[11px] text-muted-foreground">
            last 30d ({month.satisfied}/{month.due})
          </span>
        </div>
      {/if}
    </div>

    {#key habit.id}
      <HabitEditor {habit} onsave={save} />
    {/key}
  {/if}
</div>
