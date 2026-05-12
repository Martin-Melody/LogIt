<script lang="ts">
  import { onMount } from "svelte";
  import { back } from "$lib/navigation";

  import type { WorkoutSession, SetEntry } from "$lib/domain/workout";
  import { getExercises, updateSet } from "$lib/domain/workout";
  import { durationMs, formatDuration } from "$lib/domain/time";
  import { getSession } from "$lib/usecases/getSession";
  import { deleteSession } from "$lib/usecases/deleteSession";
  import { editSession } from "$lib/usecases/editSession";
  import { ArrowLeft, Share2, Trash, Pencil } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import EditSetDialog from "$lib/features/session/ui/EditSetDialog.svelte";
  import { authStore } from "$lib/api/authStore.svelte";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  const state = $state({
    loading: true,
    saving: false,
    error: null as string | null,
    session: null as WorkoutSession | null,
    deleting: false,
    sharing: false,
  });

  const edit = $state({
    active: false,
    draft: null as WorkoutSession | null,
    dialogOpen: false,
    exerciseEntryId: null as string | null,
    setId: null as string | null,
  });

  const displaySession = $derived(edit.active && edit.draft ? edit.draft : state.session);

  function longDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function sortByOrder(a: { orderIndex: number }, b: { orderIndex: number }) {
    return a.orderIndex - b.orderIndex;
  }

  function countSets(s: WorkoutSession): number {
    return getExercises(s).reduce((n, ex) => n + ex.sets.length, 0);
  }

  function totalVolume(s: WorkoutSession): number {
    let v = 0;
    for (const ex of getExercises(s))
      for (const set of ex.sets)
        v += (Number.isFinite(set.reps) ? set.reps : 0) * (Number.isFinite(set.weight) ? set.weight : 0);
    return v;
  }

  const ended = $derived(displaySession?.endedAtMs ?? displaySession?.startedAtMs ?? null);

  const durationLabel = $derived(
    state.session?.endedAtMs && state.session?.startedAtMs
      ? formatDuration(durationMs(state.session.startedAtMs, state.session.endedAtMs))
      : null,
  );

  async function load() {
    state.loading = true;
    state.error = null;
    try {
      state.session = await getSession(id);
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to load session";
      state.session = null;
    } finally {
      state.loading = false;
    }
  }

  async function deleteThisSession() {
    if (!id) return;
    state.deleting = true;
    state.error = null;
    try {
      await deleteSession(id);
      back("/sessions");
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to delete session";
    } finally {
      state.deleting = false;
    }
  }

  function startEditing() {
    if (!state.session) return;
    edit.draft = JSON.parse(JSON.stringify(state.session)) as WorkoutSession;
    edit.active = true;
  }

  function discardEditing() {
    edit.draft = null;
    edit.active = false;
    edit.dialogOpen = false;
  }

  async function saveEditing() {
    if (!edit.draft) return;
    state.saving = true;
    state.error = null;
    try {
      await editSession(edit.draft);
      state.session = edit.draft;
      edit.draft = null;
      edit.active = false;
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to save changes";
    } finally {
      state.saving = false;
    }
  }

  function openSetDialog(exerciseEntryId: string, setId: string) {
    edit.exerciseEntryId = exerciseEntryId;
    edit.setId = setId;
    edit.dialogOpen = true;
  }

  function handleSetSave(patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs">>) {
    if (!edit.draft || !edit.exerciseEntryId || !edit.setId) return;
    edit.draft = updateSet(edit.draft, edit.exerciseEntryId, edit.setId, patch);
  }

  function getEditingSet(): SetEntry | null {
    if (!edit.draft || !edit.exerciseEntryId || !edit.setId) return null;
    for (const ex of getExercises(edit.draft)) {
      if (ex.id !== edit.exerciseEntryId) continue;
      return ex.sets.find((s) => s.id === edit.setId) ?? null;
    }
    return null;
  }

  onMount(() => { void load(); });
  $effect(() => { id; void load(); });
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    {#if edit.active}
      <Button
        variant="ghost"
        size="sm"
        class="h-8 px-2 text-sm text-muted-foreground"
        disabled={state.saving}
        onclick={discardEditing}
      >
        Cancel
      </Button>

      <div class="flex-1 min-w-0">
        <span class="text-sm font-semibold">Editing session</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-8 px-2 text-sm font-semibold"
        disabled={state.saving}
        onclick={() => void saveEditing()}
      >
        {state.saving ? "Saving…" : "Save"}
      </Button>
    {:else}
      <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/sessions")}>
        <ArrowLeft class="h-4 w-4" />
      </Button>

      <div class="flex-1 min-w-0">
        <span class="text-sm font-semibold">
          {ended ? longDate(ended) : "Session"}
        </span>
      </div>

      {#if authStore.isAuthenticated}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground"
          disabled={state.loading || !state.session}
          aria-label="Share session"
          onclick={() => (state.sharing = true)}
        >
          <Share2 class="h-3.5 w-3.5" />
        </Button>
      {/if}

      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-muted-foreground"
        disabled={state.loading || !state.session}
        aria-label="Edit session"
        onclick={startEditing}
      >
        <Pencil class="h-3.5 w-3.5" />
      </Button>

      <ConfirmDialog
        title="Delete this session?"
        description="Permanently removes this session. Cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        saving={state.deleting}
        onConfirm={deleteThisSession}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-muted-foreground hover:text-destructive"
            disabled={state.loading || !state.session || state.deleting}
            aria-label="Delete session"
          >
            <Trash class="h-3.5 w-3.5" />
          </Button>
        {/snippet}
      </ConfirmDialog>
    {/if}
  </div>

  {#if state.error}
    <p class="px-3 py-2 text-sm text-destructive border-b border-border">{state.error}</p>
  {/if}

  {#if state.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !displaySession}
    <p class="px-3 py-4 text-sm text-muted-foreground">Session not found.</p>
  {:else}
    <!-- Stats strip -->
    <div class="flex items-center gap-3 px-3 py-2 border-b border-border text-xs text-muted-foreground flex-wrap">
      {#if durationLabel}
        <span>{durationLabel}</span>
        <span>·</span>
      {/if}
      <span>{getExercises(displaySession).length} exercise{getExercises(displaySession).length === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{countSets(displaySession)} sets</span>
      <span>·</span>
      <span>{totalVolume(displaySession).toLocaleString()} kg</span>
    </div>

    <!-- Exercises -->
    {#if getExercises(displaySession).length === 0}
      <p class="px-3 py-6 text-sm text-muted-foreground text-center">No exercises recorded.</p>
    {:else}
      {#each getExercises(displaySession) as ex (ex.id)}
        <div class="border-t border-border bg-muted/20 px-3 py-2 flex items-center justify-between gap-3">
          <span class="text-sm font-semibold truncate">{ex.exerciseName}</span>
          <span class="text-xs text-muted-foreground shrink-0">
            {ex.sets.length} set{ex.sets.length === 1 ? "" : "s"}
          </span>
        </div>

        {#if ex.sets.length > 0}
          <div class="grid grid-cols-[2rem_1fr_1fr{edit.active ? '_1.5rem' : ''}] gap-2 px-3 py-1 text-xs text-muted-foreground border-b border-border">
            <span>#</span>
            <span>Reps</span>
            <span>Weight</span>
            {#if edit.active}<span></span>{/if}
          </div>

          {#each [...ex.sets].sort(sortByOrder) as set, i (set.id)}
            {#if edit.active}
              <button
                type="button"
                class="w-full grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-2 items-center px-3 py-1.5 border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                onclick={() => openSetDialog(ex.id, set.id)}
              >
                <span class="text-xs text-muted-foreground">
                  {#if set.setType && set.setType !== "normal"}
                    <span class="font-medium text-foreground">{set.setType.slice(0, 1).toUpperCase()}</span>
                  {:else}
                    {i + 1}
                  {/if}
                </span>
                <span class="text-sm tabular-nums">{set.reps}</span>
                <span class="text-sm tabular-nums">{set.weight} kg</span>
                <Pencil class="h-3 w-3 text-muted-foreground" />
              </button>
            {:else}
              <div class="grid grid-cols-[2rem_1fr_1fr] gap-2 items-center px-3 py-1.5 border-b border-border/50">
                <span class="text-xs text-muted-foreground">
                  {#if set.setType && set.setType !== "normal"}
                    <span class="font-medium text-foreground">{set.setType.slice(0, 1).toUpperCase()}</span>
                  {:else}
                    {i + 1}
                  {/if}
                </span>
                <span class="text-sm tabular-nums">{set.reps}</span>
                <span class="text-sm tabular-nums">{set.weight} kg</span>
              </div>
            {/if}
          {/each}
        {/if}
      {/each}
    {/if}
  {/if}
</div>

<EditSetDialog
  open={edit.dialogOpen}
  disabled={state.saving}
  initial={getEditingSet()}
  onOpenChange={(v) => (edit.dialogOpen = v)}
  onSave={handleSetSave}
/>

<CreatePostSheet
  open={state.sharing}
  prefillSession={state.session}
  onclose={() => (state.sharing = false)}
/>
