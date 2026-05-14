<script lang="ts">
  import { onMount } from "svelte";
  import { Plus, Search, X, ChevronRight, Trash2, ArrowLeft } from "lucide-svelte";
  import { startExercisesTour } from "$lib/tour/index";
  import { back } from "$lib/navigation";
  import { Drawer } from "vaul-svelte";
  import type { Exercise, ExercisePatch } from "$lib/domain/exercise";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { updateExercise } from "$lib/usecases/updateExercise";
  import { pushDeletedExercise } from "$lib/sync/syncService";
  type Filter = "all" | "core" | "mine";

  let filter = $state<Filter>("all");
  let query = $state("");
  let allItems = $state<Exercise[]>([]);
  let loading = $state(true);

  let drawerOpen = $state(false);
  let drawerMode = $state<"add" | "edit">("add");
  let editTarget = $state<Exercise | null>(null);
  let draftName = $state("");
  let draftNotes = $state("");
  let saving = $state(false);
  let deleteConfirm = $state(false);

  const repo = getExerciseRepo();

  // Load all exercises once; filter/search are derived synchronously
  async function load() {
    loading = true;
    try {
      allItems = await repo.list();
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load().then(() => startExercisesTour());
  });

  const items = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return allItems
      .filter((e) => {
        if (filter === "core") return e.isCore;
        if (filter === "mine") return !e.isCore;
        return true;
      })
      .filter((e) => !q || e.name.toLowerCase().includes(q));
  });

  function openAdd() {
    drawerMode = "add";
    editTarget = null;
    draftName = "";
    draftNotes = "";
    deleteConfirm = false;
    drawerOpen = true;
  }

  function openEdit(ex: Exercise) {
    drawerMode = "edit";
    editTarget = ex;
    draftName = ex.name;
    draftNotes = ex.notes ?? "";
    deleteConfirm = false;
    drawerOpen = true;
  }

  async function save() {
    if (!draftName.trim()) return;
    saving = true;
    try {
      if (drawerMode === "add") {
        await repo.create(draftName.trim());
      } else if (editTarget) {
        const patch: ExercisePatch = { name: draftName.trim(), notes: draftNotes.trim() || null };
        await updateExercise(editTarget.id, patch);
      }
      drawerOpen = false;
      allItems = await repo.list();
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!editTarget) return;
    saving = true;
    try {
      const removedId = editTarget.id;
      await repo.remove(removedId);
      pushDeletedExercise(removedId);
      drawerOpen = false;
      allItems = await repo.list();
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col pb-24 min-h-full">
  <!-- Header -->
  <div class="flex items-center gap-1 px-1 py-3 border-b border-border">
    <button
      type="button"
      class="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
      onclick={() => back("/profile")}
      aria-label="Go back"
    >
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-base font-semibold flex-1">Exercises</h1>
    <button
      type="button"
      class="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
      onclick={openAdd}
      aria-label="Add exercise"
      data-tour="exercises-add"
    >
      <Plus class="h-5 w-5" />
    </button>
  </div>

  <!-- Search -->
  <div class="px-3 pt-3 pb-2" data-tour="exercises-search">
    <div class="relative">
      <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        placeholder="Search exercises…"
        class="w-full rounded border bg-background pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={query}
      />
      {#if query}
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onclick={() => (query = "")}
          aria-label="Clear search"
        >
          <X class="h-4 w-4" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Filter tabs -->
  <div class="flex gap-1 px-3 pb-2" data-tour="exercises-filter">
    {#each (["all", "core", "mine"] as Filter[]) as f (f)}
      <button
        type="button"
        class="px-3 py-1 rounded text-xs font-medium transition-colors {filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
        onclick={() => (filter = f)}
      >
        {f === "all" ? "All" : f === "core" ? "Built-in" : "Mine"}
      </button>
    {/each}
  </div>

  <!-- List -->
  {#if loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if items.length === 0}
    <p class="px-3 py-8 text-sm text-muted-foreground text-center">
      {query ? "No results." : filter === "mine" ? "No custom exercises yet." : "No exercises."}
    </p>
  {:else}
    <ul class="divide-y divide-border" data-tour="exercises-list">
      {#each items as ex (ex.id)}
        <li>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
            onclick={() => openEdit(ex)}
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{ex.name}</p>
              {#if ex.notes}
                <p class="text-xs text-muted-foreground truncate mt-0.5">{ex.notes}</p>
              {/if}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              {#if ex.isCore}
                <span class="text-xs text-muted-foreground">Built-in</span>
              {/if}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Drawer.Root
  open={drawerOpen}
  onOpenChange={(v) => { drawerOpen = v; if (!v) deleteConfirm = false; }}
  shouldScaleBackground={false}
>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-40 bg-black/40" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t border-border bg-background max-h-[80vh]">
      <!-- Absorbs initial focus so the name input isn't auto-focused on open -->
      <span tabindex="0" aria-hidden="true" class="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"></span>
      <!-- Drag handle -->
      <div class="mx-auto mt-4 mb-2 h-1 w-[100px] shrink-0 rounded-full bg-muted"></div>

      <!-- Title -->
      <div class="px-4 pb-2">
        <p class="text-base font-semibold">
          {drawerMode === "add" ? "Add exercise" : "Edit exercise"}
        </p>
      </div>

      <!-- Body -->
      <div class="flex flex-col gap-4 px-4 pb-6 overflow-y-auto">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="ex-name">Name</label>
          <input
            id="ex-name"
            type="text"
            placeholder="e.g. Cable Fly"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={draftName}
            disabled={drawerMode === "edit" && editTarget?.isCore}
          />
          {#if drawerMode === "edit" && editTarget?.isCore}
            <p class="text-xs text-muted-foreground">Built-in exercises cannot be renamed.</p>
          {/if}
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="ex-notes">
            Notes <span class="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="ex-notes"
            placeholder="e.g. Use slow eccentric, keep elbows tucked…"
            rows="3"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            bind:value={draftNotes}
          ></textarea>
        </div>

        <button
          type="button"
          class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled={!draftName.trim() || saving}
          onclick={() => void save()}
        >
          {saving ? "Saving…" : drawerMode === "add" ? "Add exercise" : "Save changes"}
        </button>

        {#if drawerMode === "edit" && editTarget && !editTarget.isCore}
          {#if deleteConfirm}
            <div class="flex flex-col gap-2">
              <p class="text-sm text-center text-muted-foreground">Delete "{editTarget.name}"?</p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="py-2.5 rounded border text-sm"
                  onclick={() => (deleteConfirm = false)}
                >Cancel</button>
                <button
                  type="button"
                  class="py-2.5 rounded bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
                  disabled={saving}
                  onclick={() => void remove()}
                >Delete</button>
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="w-full py-2.5 rounded border border-destructive/50 text-destructive text-sm flex items-center justify-center gap-2"
              onclick={() => (deleteConfirm = true)}
            >
              <Trash2 class="h-4 w-4" />
              Delete exercise
            </button>
          {/if}
        {/if}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
