<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { chip, segment, segmentTrack } from "$lib/components/ui/choice";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Plus, Search, X, ChevronRight, Package, Check } from "lucide-svelte";
  import { autoTour } from "$lib/tour/index";
  import { back } from "$lib/navigation";
  import { Drawer } from "vaul-svelte";
  import { longpress } from "$lib/swipe";
  import type { Exercise } from "@logit/core/domain/exercise";
  import {
    KIND_LABEL,
    LIBRARY_KINDS,
    entryDetails,
    filterLibrary,
    librarySections,
    type LibraryEntry,
    type LibraryFilter,
    type LibraryKind,
  } from "@logit/core/domain/library";
  import { loadLibrary } from "$lib/data/library/library";
  import { exportExercisesAsPack, isUserExercise } from "$lib/plugins";
  import NewLibraryItemSheet from "$lib/features/library/NewLibraryItemSheet.svelte";

  function kindFromUrl(): LibraryKind {
    const k = page.url.searchParams.get("kind");
    return k === "cardio" || k === "mobility" ? k : "strength";
  }

  let kind = $state<LibraryKind>(kindFromUrl());
  let source = $state<NonNullable<LibraryFilter["source"]>>("all");
  let query = $state("");
  let all = $state<LibraryEntry[]>([]);
  let loading = $state(true);
  let newOpen = $state(false);

  // Multi-select for "export as pack" (your own strength exercises)
  let selecting = $state(false);
  let selectedIds = $state<string[]>([]);
  const selectedCount = $derived(selectedIds.length);
  const strengthMine = $derived(
    all.filter((e) => e.kind === "strength" && e.source === "mine" && isUserExercise(e.item as Exercise)).map((e) => e.item as Exercise),
  );
  const selectedExercises = $derived(strengthMine.filter((e) => selectedIds.includes(e.id)));
  let suppressNextClick = false;

  let exportOpen = $state(false);
  let exportName = $state("");
  let exporting = $state(false);
  let exportError = $state<string | null>(null);

  async function load() {
    loading = true;
    try {
      all = await loadLibrary();
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load().then(() => autoTour("app.exercises"));
  });

  function setKind(k: LibraryKind) {
    kind = k;
    exitSelection();
    const url = new URL(page.url);
    if (k === "strength") url.searchParams.delete("kind");
    else url.searchParams.set("kind", k);
    void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
  }

  /** The chips: All, LogIt, Mine, one per coach, Packs. Only ones with items in this kind. */
  const sourceChips = $derived.by(() => {
    const inKind = all.filter((e) => e.kind === kind);
    const chips: { value: NonNullable<LibraryFilter["source"]>; label: string }[] = [{ value: "all", label: "All" }];
    if (inKind.some((e) => e.source === "logit")) chips.push({ value: "logit", label: "LogIt" });
    chips.push({ value: "mine", label: "Mine" });
    const coaches = new Map<string, string>();
    for (const e of inKind) if (e.source === "coach" && e.coach) coaches.set(e.coach.coachId, e.coach.coachName);
    for (const [id, name] of coaches) chips.push({ value: `coach:${id}`, label: `From ${name}` });
    if (inKind.some((e) => e.source === "pack")) chips.push({ value: "pack", label: "Packs" });
    return chips;
  });

  $effect(() => {
    if (!sourceChips.some((c) => c.value === source)) source = "all";
  });

  const shown = $derived(filterLibrary(all, { kind, query, source }));
  const sections = $derived(librarySections(shown));

  function href(e: LibraryEntry): string {
    return e.kind === "strength"
      ? `/exercises/${encodeURIComponent(e.item.id)}`
      : `/exercises/${e.kind}/${encodeURIComponent(e.item.id)}`;
  }

  function selectable(e: LibraryEntry): boolean {
    return e.kind === "strength" && e.source === "mine" && isUserExercise(e.item as Exercise);
  }

  function startSelection(e: LibraryEntry) {
    if (!selectable(e)) return;
    suppressNextClick = true;
    selecting = true;
    if (!selectedIds.includes(e.item.id)) selectedIds = [...selectedIds, e.item.id];
  }

  function onRowClick(e: LibraryEntry) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (selecting) {
      if (!selectable(e)) return;
      selectedIds = selectedIds.includes(e.item.id)
        ? selectedIds.filter((id) => id !== e.item.id)
        : [...selectedIds, e.item.id];
      return;
    }
    void goto(href(e));
  }

  function exitSelection() {
    selecting = false;
    selectedIds = [];
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

  async function onSaved(saved: { kind: LibraryKind; id: string }) {
    await load();
    void goto(saved.kind === "strength" ? `/exercises/${encodeURIComponent(saved.id)}` : `/exercises/${saved.kind}/${encodeURIComponent(saved.id)}`);
  }

  const emptyText = $derived(
    query
      ? "Nothing matches that."
      : source === "mine"
        ? `None of your own yet. Tap + to add one.`
        : "Nothing here yet.",
  );
</script>

<div class="flex min-h-full flex-col pb-24">
  <PageHeader>
    {#if selecting}
      <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" onclick={exitSelection} aria-label="Cancel selection">
        <X class="h-4 w-4" />
      </button>
      <h1 class="page-title">{selectedCount} selected</h1>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
        onclick={() => { exportName = ""; exportError = null; exportOpen = true; }}
        disabled={selectedCount === 0}
        aria-label="Export selected as a pack"
        title="Export as pack"
      >
        <Package class="h-4 w-4" />
      </button>
    {:else}
      <BackButton onclick={() => back("/profile")} />
      <h1 class="page-title">Library</h1>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        onclick={() => (newOpen = true)}
        aria-label="New {KIND_LABEL[kind].toLowerCase()} item"
        data-guide="exercises-add"
      >
        <Plus class="h-5 w-5" />
      </button>
    {/if}
  </PageHeader>

  <div class="flex flex-col gap-2 px-3 pb-2 pt-3">
    <div class={segmentTrack} role="tablist" aria-label="Kind">
      {#each LIBRARY_KINDS as k (k)}
        <button type="button" role="tab" aria-selected={kind === k} class={segment(kind === k)} onclick={() => setKind(k)}>
          {KIND_LABEL[k]}
        </button>
      {/each}
    </div>

    <div class="relative" data-guide="exercises-search">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        placeholder="Search {KIND_LABEL[kind].toLowerCase()}…"
        aria-label="Search {KIND_LABEL[kind].toLowerCase()}"
        class="h-10 w-full rounded-md border bg-background pl-8 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={query}
      />
      {#if query}
        <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onclick={() => (query = "")} aria-label="Clear search">
          <X class="h-4 w-4" />
        </button>
      {/if}
    </div>

    <div class="-mx-3 flex gap-2 overflow-x-auto px-3" data-guide="exercises-filter">
      {#each sourceChips as c (c.value)}
        <button type="button" class={chip(source === c.value)} aria-pressed={source === c.value} onclick={() => (source = c.value)}>
          {c.label}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if shown.length === 0}
    <p class="px-3 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  {:else}
    {#if kind === "strength" && !selecting && strengthMine.length > 0 && (source === "all" || source === "mine")}
      <p class="px-3 pb-1 text-[11px] text-muted-foreground">Long-press one of your own exercises to select several and export them as a pack.</p>
    {/if}
    <div data-guide="exercises-list">
      {#each sections as s (s.key)}
        <h2 class="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</h2>
        <ul class="divide-y divide-border border-y border-border">
          {#each s.entries as e (e.kind + e.item.id)}
            {@const canSelect = selectable(e)}
            {@const checked = selectedIds.includes(e.item.id)}
            <li>
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors {selecting && !canSelect ? 'opacity-40' : 'hover:bg-muted/40 active:bg-muted/60'} {checked ? 'bg-primary/5' : ''}"
                onclick={() => onRowClick(e)}
                use:longpress={() => startSelection(e)}
              >
                {#if selecting}
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors {checked ? 'border-primary bg-primary text-primary-foreground' : canSelect ? 'border-muted-foreground' : 'border-transparent'}">
                    {#if checked}<Check class="h-3.5 w-3.5" />{/if}
                  </span>
                {/if}
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[15px]">{e.item.name}</span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">{entryDetails(e)}</span>
                </span>
                {#if !selecting}<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    </div>
  {/if}
</div>

<NewLibraryItemSheet open={newOpen} {kind} entries={all} onOpenChange={(v) => (newOpen = v)} {onSaved} />

<Drawer.Root open={exportOpen} onOpenChange={(v) => (exportOpen = v)} shouldScaleBackground={false}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-40 bg-black/40" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-xl border-t border-border bg-background">
      <span tabindex="0" aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"></span>
      <div class="mx-auto mb-2 mt-4 h-1 w-[100px] shrink-0 rounded-full bg-muted"></div>
      <div class="px-4 pb-2">
        <p class="text-base font-semibold">Export as pack</p>
        <p class="mt-1 text-xs text-muted-foreground">
          Bundles {selectedCount} {selectedCount === 1 ? "exercise" : "exercises"} into one file anyone can install from Plugins → Add → File.
        </p>
      </div>
      <div class="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="pack-name">Pack name</label>
          <input id="pack-name" type="text" placeholder="e.g. My Gym's Machines" class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" bind:value={exportName} />
        </div>
        {#if exportError}<p class="text-xs text-destructive">{exportError}</p>{/if}
        <button type="button" class="w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!exportName.trim() || exporting} onclick={() => void exportPack()}>
          {exporting ? "Exporting…" : "Download pack file"}
        </button>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
