<script lang="ts">
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { Plus } from "lucide-svelte";
  import { toast } from "$lib/components/ui/sonner/index";
  import { onMount } from "svelte";

  import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { refreshProgressionState } from "$lib/usecases/progression/getSuggestion";
  import type { WorkoutSession } from "$lib/domain/workout";
  import { addExercise, removeExercise, moveExercise } from "$lib/domain/workout";

  import { Button } from "$lib/components/ui/button/index.js";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { startSessionTour, destroyActiveTour } from "$lib/tour/index";

  // Registers built-in blocks (strength) as a side effect
  import "$lib/features/session/blocks/index";
  import BlockHost from "$lib/features/session/blocks/BlockHost.svelte";
  import AddExerciseDialog from "$lib/features/session/ui/AddExerciseDialog.svelte";
  import EmptySessionCard from "$lib/features/session/ui/EmptySessionCard.svelte";

  import CurrentSessionHeader from "./Commponents/CurrentSessionHeader.svelte";
  import FinishWorkoutCard from "./Commponents/FinishWorkoutCard.svelte";

  onMount(() => {
    setTimeout(() => startSessionTour(), 600);
  });

  const ui = $state({
    saving: false,
    finishing: false,
    error: null as string | null,
  });

  const addBlockUi = $state({ open: false });
  let finishBarEl = $state<HTMLDivElement | null>(null);
  let addButtonBottom = $state(0);

  function updateAddButtonOffset() {
    addButtonBottom = (finishBarEl?.offsetHeight ?? 0) + 12;
  }

  onMount(() => {
    updateAddButtonOffset();
    const observer = new ResizeObserver(() => updateAddButtonOffset());
    if (finishBarEl) observer.observe(finishBarEl);
    window.addEventListener("resize", updateAddButtonOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAddButtonOffset);
    };
  });

  function sortByOrderIndex(a: { orderIndex: number }, b: { orderIndex: number }) {
    return a.orderIndex - b.orderIndex;
  }

  function getSessionOrNull(): WorkoutSession | null {
    return get(currentSession);
  }

  async function persistDraft(next: WorkoutSession) {
    if (ui.finishing) return;
    currentSession.setSession(next);
    ui.saving = true;
    ui.error = null;
    try {
      await getWorkoutRepo().saveDraftSession(next);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save draft session";
    } finally {
      ui.saving = false;
    }
  }

  async function onMutate(updater: (s: WorkoutSession) => WorkoutSession) {
    const s = getSessionOrNull();
    if (!s || ui.finishing) return;
    await persistDraft(updater(s));
  }

  async function addExerciseWithName(selection: { name: string; exerciseId?: string }) {
    const s = getSessionOrNull();
    if (!s) return;

    const trimmed = selection.name.trim();
    if (!trimmed) return;

    try {
      let exerciseId = selection.exerciseId;
      if (!exerciseId) {
        const ex = await getExerciseRepo().create(trimmed);
        exerciseId = ex.id;
      }
      const updated = addExercise(s, { exerciseName: trimmed, exerciseId });
      await persistDraft(updated);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to add exercise";
      toast.error(ui.error ?? "Failed to add exercise");
    }
  }

  function openAddBlock() {
    if (ui.finishing) return;
    destroyActiveTour();
    addBlockUi.open = true;
  }

  async function onDeleteBlock(exerciseEntryId: string) {
    await onMutate((s) => removeExercise(s, exerciseEntryId));
  }

  async function onMoveBlock(exerciseEntryId: string, direction: "up" | "down") {
    await onMutate((s) => moveExercise(s, exerciseEntryId, direction));
  }

  async function finish() {
    if (ui.finishing) return;
    ui.finishing = true;
    ui.error = null;

    const sessionSnapshot = getSessionOrNull();
    currentSession.beginTransition();

    try {
      await goto("/");
      await currentSession.finish();
      void recentSessions.refresh(5);

      if (sessionSnapshot) {
        for (const ex of sessionSnapshot.exercises) {
          void refreshProgressionState({ id: ex.exerciseId, name: ex.exerciseName });
        }
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to finish workout";
      ui.finishing = false;
      currentSession.endTransition();
    }
  }
</script>

<div
  class="flex flex-col pb-48"
  onpointerdown={(e) => {
    if (!(e.target as HTMLElement).closest("input, textarea")) {
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
        active.blur();
      }
    }
  }}
>
  <CurrentSessionHeader saving={ui.saving || ui.finishing} error={ui.error} />

  {#if !ui.finishing}
    {#if !$currentSession || $currentSession.exercises.length === 0}
      <EmptySessionCard onAddBlock={openAddBlock} />
    {:else}
      {@const sortedExercises = [...$currentSession.exercises].sort(sortByOrderIndex)}
      {#each sortedExercises as ex, i (ex.id)}
        <BlockHost
          type="strength"
          data={ex}
          saving={ui.saving || ui.finishing}
          canMoveUp={i > 0}
          canMoveDown={i < sortedExercises.length - 1}
          onMoveUp={() => onMoveBlock(ex.id, "up")}
          onMoveDown={() => onMoveBlock(ex.id, "down")}
          onDelete={() => onDeleteBlock(ex.id)}
          {onMutate}
        />
      {/each}
    {/if}
  {/if}

  <AddExerciseDialog
    open={addBlockUi.open}
    saving={ui.saving || ui.finishing}
    onOpenChange={(v) => (addBlockUi.open = v)}
    onSubmit={addExerciseWithName}
  />

  {#if !ui.finishing && !$keyboard.visible}
    <div
      class="fixed right-3 z-20"
      style={`bottom: ${addButtonBottom}px;`}
    >
      <Button
        size="icon"
        class="rounded-full shadow-lg"
        disabled={ui.saving || ui.finishing}
        aria-label="Add exercise"
        data-tour="session-add-exercise"
        onclick={openAddBlock}
      >
        <Plus />
      </Button>
    </div>

    <div
      bind:this={finishBarEl}
      data-tour="session-finish"
      class="fixed left-0 right-0 bottom-0 border-t border-border bg-background px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <FinishWorkoutCard
        canFinish={!!$currentSession && !$currentSession.endedAtMs}
        saving={ui.saving || ui.finishing}
        onFinish={finish}
      />
    </div>
  {/if}
</div>
