<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  import type {
    WorkoutSplit,
    SplitDay,
    PlannedExercise,
  } from "$lib/domain/WorkoutSplit";
  import { touchSplit } from "$lib/domain/WorkoutSplit";
  import { createId } from "$lib/domain/ids";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";

  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { ArrowLeftIcon } from "lucide-svelte";
  import { Plus, Trash } from "@lucide/svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const props = $props<{ params: { id: string; dayId: string } }>();
  const splitId = $derived(props.params.id);
  const dayId = $derived(props.params.dayId);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,

    addOpen: false,
    addName: "",
    addError: null as string | null,
  });

  let split = $state<WorkoutSplit | null>(null);

  const day = $derived<SplitDay | null>(
    split ? ((split.days ?? []).find((x) => x.id === dayId) ?? null) : null,
  );

  function sortExercises(exs: PlannedExercise[]): PlannedExercise[] {
    return [...exs].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      split = await getSplit(splitId);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load split";
      split = null;
    } finally {
      ui.loading = false;
    }
  }

  async function persist(next: WorkoutSplit) {
    ui.saving = true;
    ui.error = null;
    try {
      const touched = touchSplit(next);
      await saveSplit(touched);
      split = touched;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save split";
    } finally {
      ui.saving = false;
    }
  }

  function back() {
    void goto(`/splits/${splitId}`);
  }

  async function renameDay(nextName: string) {
    if (!split || !day) return;

    const name = nextName.trim();
    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => (d.id === day.id ? { ...d, name } : d)),
    };

    await persist(next);
  }

  function openAddExercise() {
    ui.addOpen = true;
    ui.addName = "";
    ui.addError = null;
  }

  async function addExercise() {
    if (!split || !day) return;

    const name = ui.addName.trim();
    if (!name) {
      ui.addError = "Please enter an exercise name.";
      return;
    }

    const nextOrder =
      day.exercises.length === 0
        ? 0
        : Math.max(...day.exercises.map((e) => e.orderIndex)) + 1;

    const newEx: PlannedExercise = {
      id: createId("pex"),
      orderIndex: nextOrder,
      exerciseName: name,
      targets: {},
    };

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) =>
        d.id === day.id ? { ...d, exercises: [...d.exercises, newEx] } : d,
      ),
    };

    ui.addOpen = false;
    await persist(next);
  }

  async function renameExercise(exId: string, nextName: string) {
    if (!split || !day) return;

    const name = nextName.trim();
    if (!name) return;

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        if (d.id !== day.id) return d;
        return {
          ...d,
          exercises: d.exercises.map((e) =>
            e.id === exId ? { ...e, exerciseName: name } : e,
          ),
        };
      }),
    };

    await persist(next);
  }

  async function deleteExercise(exId: string) {
    if (!split || !day) return;

    const next: WorkoutSplit = {
      ...split,
      days: split.days.map((d) => {
        if (d.id !== day.id) return d;
        return {
          ...d,
          exercises: d.exercises.filter((e) => e.id !== exId),
        };
      }),
    };

    await persist(next);
  }

  async function deleteDay() {
    if (!split || !day) return;

    const next: WorkoutSplit = {
      ...split,
      days: split.days
        .filter((d) => d.id !== day.id)
        .map((d, i) => ({ ...d, orderIndex: i })),
    };

    await persist(next);
    back();
  }

  onMount(() => {
    void load();
  });
</script>

<div class="p-3 flex flex-col gap-3 pb-24">
  <Card.Root class="w-full">
    <Card.Header>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <Card.Title>Plan day</Card.Title>
          <Card.Description>
            {#if day}
              Day {day.orderIndex + 1}
            {/if}
          </Card.Description>
        </div>

        <div class="flex gap-2">
          <Button variant="outline" size="icon" onclick={back}>
            <ArrowLeftIcon />
          </Button>
          <Button
            onclick={openAddExercise}
            size="icon"
            disabled={!day || ui.saving}
          >
            <Plus />
          </Button>

          <ConfirmDialog
            title="Delete this day?"
            description="This will remove the day and all exercises planned in it. This action cannot be undone."
            confirmLabel="Delete day"
            cancelLabel="Cancel"
            saving={ui.saving}
            onConfirm={deleteDay}
          >
            <Button
              variant="destructive"
              size="icon"
              disabled={!day || ui.saving}
              aria-label="Delete day"
            >
              <Trash />
            </Button>
          </ConfirmDialog>
        </div>
      </div>
    </Card.Header>

    <Card.Content class="flex flex-col gap-3">
      {#if ui.error}
        <p class="text-sm text-destructive">{ui.error}</p>
      {/if}

      {#if ui.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if !split}
        <p class="text-sm text-muted-foreground">Split not found.</p>
      {:else if !day}
        <p class="text-sm text-muted-foreground">Day not found.</p>
      {:else}
        <div class="rounded-lg border p-3 flex flex-col gap-2">
          <Label for="day-name">Day Name</Label>
          <Input
            id="day-name"
            value={day.name ?? ""}
            disabled={ui.saving}
            placeholder="e.g. Push"
            onblur={(e) =>
              renameDay((e.currentTarget as HTMLInputElement).value)}
          />
          <p class="text-xs text-muted-foreground">
            Tip: leave empty if you don’t want a name.
          </p>
        </div>

        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            Exercises ({day.exercises.length})
          </p>
        </div>

        {#if day.exercises.length === 0}
          <p class="text-sm text-muted-foreground">
            No exercises yet. Add one to start planning.
          </p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each sortExercises(day.exercises) as ex (ex.id)}
              <div
                class="rounded-lg border p-3 flex items-start justify-between gap-3"
              >
                <div class="min-w-0 flex-1">
                  <Input
                    value={ex.exerciseName}
                    disabled={ui.saving}
                    onblur={(e) =>
                      renameExercise(
                        ex.id,
                        (e.currentTarget as HTMLInputElement).value,
                      )}
                  />
                  <p class="mt-1 text-xs text-muted-foreground">
                    Targets later (sets/reps/weight) — MVP just names.
                  </p>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  disabled={ui.saving}
                  onclick={() => void deleteExercise(ex.id)}
                >
                  <Trash color="red" />
                </Button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Add Exercise Dialog -->
  <Dialog.Root bind:open={ui.addOpen}>
    <Dialog.Content class="sm:max-w-[420px]">
      <Dialog.Header>
        <Dialog.Title>Add exercise</Dialog.Title>
        <Dialog.Description>Type a name like “Bench Press”.</Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-2">
        <Label for="ex-name">Exercise name</Label>
        <Input
          id="ex-name"
          value={ui.addName}
          disabled={ui.saving}
          placeholder="e.g. Bench Press"
          oninput={(e) =>
            (ui.addName = (e.currentTarget as HTMLInputElement).value)}
          onkeydown={(e) => {
            const k = (e as KeyboardEvent).key;
            if (k === "Enter") void addExercise();
            if (k === "Escape") ui.addOpen = false;
          }}
        />
        {#if ui.addError}
          <p class="text-sm text-destructive">{ui.addError}</p>
        {/if}
      </div>

      <Dialog.Footer>
        <Button
          variant="outline"
          disabled={ui.saving}
          onclick={() => (ui.addOpen = false)}
        >
          Cancel
        </Button>
        <Button disabled={ui.saving} onclick={() => void addExercise()}>
          Add
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</div>
