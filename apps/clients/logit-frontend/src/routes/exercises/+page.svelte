<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Plus, Search, X, ChevronRight, ArrowLeft, Package, Check } from "lucide-svelte";
  import { startExercisesTour } from "$lib/tour/index";
  import { back } from "$lib/navigation";
  import { Drawer } from "vaul-svelte";
  import { longpress } from "$lib/swipe";
  import type { Exercise, ExerciseType } from "@logit/core/domain/exercise";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { exportExercisesAsPack, isUserExercise } from "$lib/plugins";
  type Filter = "all" | "core" | "mine";

  let filter = $state<Filter>("all");
  let query = $state("");
  let allItems = $state<Exercise[]>([]);
  let loading = $state(true);

  let drawerOpen = $state(false);
  let draftName = $state("");
  let draftNotes = $state("");
  let draftType = $state<ExerciseType>("normal");
  let saving = $state(false);

  // Multi-select for "export as pack"
  let selecting = $state(false);
  let selectedIds = $state<string[]>([]);
  const selectedCount = $derived(selectedIds.length);
  const selectedExercises = $derived(allItems.filter((e) => selectedIds.includes(e.id)));
  const exportable = $derived(allItems.filter(isUserExercise));
  let suppressNextClick = false;

  let exportOpen = $state(false);
  let exportName = $state("");
  let exporting = $state(false);
  let exportError = $state<string | null>(null);

  const repo = getExerciseRepo();

  function startSelection(ex: Exercise) {
    if (!isUserExercise(ex)) return;
    suppressNextClick = true;
    selecting = true;
    if (!selectedIds.includes(ex.id)) selectedIds = [...selectedIds, ex.id];
  }

  function toggleSelect(ex: Exercise) {
    if (!isUserExercise(ex)) return;
    selectedIds = selectedIds.includes(ex.id)
      ? selectedIds.filter((id) => id !== ex.id)
      : [...selectedIds, ex.id];
  }

  function exitSelection() {
    selecting = false;
    selectedIds = [];
  }

  function onRowClick(ex: Exercise) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (selecting) {
      toggleSelect(ex);
      return;
    }
    void goto(`/exercises/${ex.id}`);
  }

  function openExport() {
    exportName = "";
    exportError = null;
    exportOpen = true;
  }

  async function exportPack() {
    if (!exportName.trim() || exporting || selectedExercises.length === 0) return;
    exporting = true;
    exportError = null;
    try {
      await exportExercisesAsPack(exportName, selectedExercises);
      exportOpen = false;
      exitSelection();
    } catch (e) {
      exportError = e instanceof Error ? e.message : "Could not build the pack.";
    } finally {
      exporting = false;
    }
  }

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
    draftName = "";
    draftNotes = "";
    draftType = "normal";
    drawerOpen = true;
  }

  async function save() {
    if (!draftName.trim()) return;
    saving = true;
    try {
      await repo.create(draftName.trim(), draftType);
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
    {#if selecting}
      <button
        type="button"
        class="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
        onclick={exitSelection}
        aria-label="Cancel selection"
      >
        <X class="h-4 w-4" />
      </button>
      <h1 class="text-base font-semibold flex-1">
        {selectedCount} selected
      </h1>
      <button
        type="button"
        class="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-40 shrink-0"
        onclick={openExport}
        disabled={selectedCount === 0}
        aria-label="Export selected as a pack"
        title="Export as pack"
      >
        <Package class="h-4 w-4" />
      </button>
    {:else}
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
    {/if}
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
    {#if !selecting && exportable.length > 0}
      <p class="px-3 pb-1 text-[11px] text-muted-foreground/70">
        Long-press a custom exercise to select several and export them as a pack.
      </p>
    {/if}
    <ul class="divide-y divide-border" data-tour="exercises-list">
      {#each items as ex (ex.id)}
        {@const selectable = isUserExercise(ex)}
        {@const checked = selectedIds.includes(ex.id)}
        <li>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors {selecting && !selectable
              ? 'opacity-40'
              : 'hover:bg-muted/40 active:bg-muted/60'} {checked ? 'bg-primary/5' : ''}"
            onclick={() => onRowClick(ex)}
            use:longpress={() => startSelection(ex)}
          >
            {#if selecting}
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors {checked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : selectable
                    ? 'border-muted-foreground/40'
                    : 'border-transparent'}"
              >
                {#if checked}<Check class="h-3.5 w-3.5" />{/if}
              </span>
            {/if}
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{ex.name}</p>
              {#if ex.notes}
                <p class="text-xs text-muted-foreground truncate mt-0.5">{ex.notes}</p>
              {/if}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              {#if ex.exerciseType && ex.exerciseType !== "normal"}
                <span class="text-xs text-muted-foreground capitalize">{ex.exerciseType}</span>
              {/if}
              {#if ex.isCore}
                <span class="text-xs text-muted-foreground">Built-in</span>
              {/if}
              {#if !selecting}
                <ChevronRight class="h-4 w-4 text-muted-foreground" />
              {/if}
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Drawer.Root
  open={drawerOpen}
  onOpenChange={(v) => (drawerOpen = v)}
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
        <p class="text-base font-semibold">Add exercise</p>
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
          />
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

        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Type</span>
          <div class="flex gap-2">
            {#each ([["normal", "Normal"], ["assisted", "Assisted"], ["bodyweight", "Bodyweight"]] as [ExerciseType, string][]) as [type, label] (type)}
              <button
                type="button"
                class="flex-1 py-1.5 rounded border text-xs font-medium transition-colors {draftType === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}"
                onclick={() => (draftType = type)}
              >
                {label}
              </button>
            {/each}
          </div>
          {#if draftType === "assisted"}
            <p class="text-xs text-muted-foreground">Weight = assistance amount. Progression reduces assistance each session.</p>
          {:else if draftType === "bodyweight"}
            <p class="text-xs text-muted-foreground">Enter 0 for pure bodyweight, or extra load on top (e.g. 25 = BW+25kg).</p>
          {/if}
        </div>

        <button
          type="button"
          class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled={!draftName.trim() || saving}
          onclick={() => void save()}
        >
          {saving ? "Saving…" : "Add exercise"}
        </button>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<Drawer.Root open={exportOpen} onOpenChange={(v) => (exportOpen = v)} shouldScaleBackground={false}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-40 bg-black/40" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t border-border bg-background max-h-[80vh]">
      <span tabindex="0" aria-hidden="true" class="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"></span>
      <div class="mx-auto mt-4 mb-2 h-1 w-[100px] shrink-0 rounded-full bg-muted"></div>

      <div class="px-4 pb-2">
        <p class="text-base font-semibold">Export as pack</p>
        <p class="mt-1 text-xs text-muted-foreground">
          Bundles {selectedCount}
          {selectedCount === 1 ? "exercise" : "exercises"} into one file anyone can
          install from Plugins → Add → File.
        </p>
      </div>

      <div class="flex flex-col gap-4 px-4 pb-6 overflow-y-auto">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="pack-name">Pack name</label>
          <input
            id="pack-name"
            type="text"
            placeholder="e.g. My Gym's Machines"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={exportName}
          />
        </div>

        {#if exportError}
          <p class="text-xs text-destructive">{exportError}</p>
        {/if}

        <button
          type="button"
          class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled={!exportName.trim() || exporting}
          onclick={() => void exportPack()}
        >
          {exporting ? "Exporting…" : "Download pack file"}
        </button>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
