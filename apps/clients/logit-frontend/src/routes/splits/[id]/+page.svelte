<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";

  import type { WorkoutSplit, SplitDay } from "$lib/domain/WorkoutSplit";
  import { touchSplit } from "$lib/domain/WorkoutSplit";

  import { splits } from "$lib/stores/splits.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { createId } from "$lib/domain/ids";
  import { ArrowLeftIcon, CheckIcon, Pencil, Trash } from "lucide-svelte";
  import { Check, Rainbow, X } from "@lucide/svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { deleteSplit } from "$lib/usecases/Splits/deleteSplit";

  const props = $props<{ params: { id: string } }>();
  const splitId = $derived(props.params.id);

  const ui = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    renaming: false,
    nameDraft: "",
  });

  // IMPORTANT: in runes mode, the $state(...) binding is const, but the value is mutable.
  // So we keep "split" as a $state variable and update it by assignment.
  let split = $state<WorkoutSplit | null>(null);

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  function sortDays(days: SplitDay[]): SplitDay[] {
    return [...days].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const s = await getSplit(splitId);
      split = s;
      ui.nameDraft = s?.name ?? "";
      await activeSplit.load(); // so badge renders correctly
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

      // keep list + active split in sync
      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save split";
    } finally {
      ui.saving = false;
    }
  }

  function startRename() {
    if (!split) return;
    ui.nameDraft = split.name;
    ui.renaming = true;
  }

  async function commitRename() {
    if (!split) return;

    const name = ui.nameDraft.trim() || "New Split";
    ui.renaming = false;

    if (name === split.name) return;
    await persist({ ...split, name });
  }

  function cancelRename() {
    ui.renaming = false;
    ui.nameDraft = split?.name ?? "";
  }

  async function addDay() {
    if (!split) return;

    const nextOrder =
      split.days.length === 0
        ? 0
        : Math.max(...split.days.map((d) => d.orderIndex)) + 1;

    const next: WorkoutSplit = {
      ...split,
      days: [
        ...split.days,
        {
          id: createId("day"),
          orderIndex: nextOrder,
          name: `Day ${nextOrder + 1}`,
          exercises: [],
        },
      ],
    };

    await persist(next);
  }

  function openDay(dayId: string) {
    void goto(`/splits/${splitId}/days/${dayId}`);
  }

  async function setActive() {
    if (!split) return;
    ui.error = null;
    try {
      await splits.setActive(split.id);
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to set active split";
    }
  }

  async function deleteThisSplit() {
    if (!split) return;

    ui.saving = true;
    ui.error = null;

    try {
      await deleteSplit(split.id);

      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });

      await activeSplit.load();

      back();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to delete split";
    } finally {
      ui.saving = false;
    }
  }

  function back() {
    void goto("/splits");
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
          <Card.Title>Split</Card.Title>
          <Card.Description>
            {#if split}
              Updated {formatDate(split.updatedAtMs)}
            {/if}
          </Card.Description>
        </div>

        <div class="flex gap-2">
          <Button variant="outline" size="icon" onclick={back}
            ><ArrowLeftIcon /></Button
          >
          <Button
            size="icon"
            variant="outline"
            onclick={() => void setActive()}
            disabled={!split || ui.saving}
          >
            <Rainbow />
          </Button>

          <ConfirmDialog
            title="Delete this split?"
            description="This will permanently delete the split and all its days/exercises. This action cannot be undone."
            confirmLabel="Delete split"
            cancelLabel="Cancel"
            saving={ui.saving}
            onConfirm={deleteThisSplit}
          >
            <Button
              variant="destructive"
              size="icon"
              disabled={!split || ui.saving}
              aria-label="Delete split"
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
      {:else}
        <div class="rounded-lg border p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              {#if ui.renaming}
                <input
                  class="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={ui.nameDraft}
                  disabled={ui.saving}
                  oninput={(e) =>
                    (ui.nameDraft = (
                      e.currentTarget as HTMLInputElement
                    ).value)}
                  onkeydown={(e) => {
                    const k = (e as KeyboardEvent).key;
                    if (k === "Enter") void commitRename();
                    if (k === "Escape") cancelRename();
                  }}
                  onblur={() => void commitRename()}
                />
              {:else}
                <div class="flex items-center gap-2 min-w-0">
                  <p class="text-sm font-medium truncate">{split.name}</p>

                  {#if $activeSplit?.id === split.id}
                    <Badge variant="secondary">Active</Badge>
                  {/if}
                </div>
              {/if}
            </div>

            <div class=" flex gap-2">
              {#if ui.renaming}
                <Button
                  size="icon"
                  variant="destructive"
                  onclick={cancelRename}
                  disabled={ui.saving}
                >
                  <X />
                </Button>
                <Button
                  size="icon"
                  onclick={() => void commitRename()}
                  disabled={ui.saving}
                >
                  <Check />
                </Button>
              {:else}
                <Button
                  size="icon"
                  variant="outline"
                  onclick={startRename}
                  disabled={ui.saving}
                >
                  <Pencil />
                </Button>
              {/if}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            Days ({split.days.length})
          </p>
          <Button
            variant="outline"
            onclick={() => void addDay()}
            disabled={ui.saving}
          >
            Add day
          </Button>
        </div>

        {#if split.days.length === 0}
          <p class="text-sm text-muted-foreground">
            No days yet. Add one to start planning workouts.
          </p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each sortDays(split.days) as d (d.id)}
              <button
                type="button"
                class="rounded-lg border p-3 text-left"
                onclick={() => {
                  openDay(d.id);
                }}
              >
                <p class="text-sm font-medium">
                  Day {d.orderIndex + 1}{d.name ? ` — ${d.name}` : ""}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {d.exercises.length} exercise{d.exercises.length === 1
                    ? ""
                    : "s"}
                </p>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>
</div>
