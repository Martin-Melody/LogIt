<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { createId } from "@logit/core/domain/ids";
  import {
    KIND_LABEL,
    LIBRARY_KINDS,
    copyLibraryItem,
    entryDetails,
    filterLibrary,
    nameTaken,
    newCardioActivity,
    newMobilityDrill,
    sourceLabel,
    type LibraryEntry,
    type LibraryFilter,
    type LibraryItem,
    type LibraryKind,
  } from "@logit/core/domain/library";
  import { deleteLibraryItem, loadWebLibrary, saveLibraryItem, type WebLibrary } from "$lib/features/library/libraryData";
  import LibraryItemPanel from "$lib/features/library/LibraryItemPanel.svelte";

  // Me › Library: everything you can add to a workout. LogIt's, your own, and what your
  // coach shares with you. Logging stays on the phone; this is for looking things up and
  // writing your own items properly at a keyboard.

  let lib = $state<WebLibrary | null>(null);
  let error = $state<string | null>(null);
  let query = $state("");
  let source = $state<NonNullable<LibraryFilter["source"]>>("all");

  let newOpen = $state(false);
  let newName = $state("");
  let creating = $state(false);

  const kind = $derived<LibraryKind>(
    (["strength", "cardio", "mobility"] as const).find((k) => k === page.url.searchParams.get("kind")) ?? "strength",
  );
  const selectedId = $derived(page.url.searchParams.get("id"));

  const shown = $derived(lib ? filterLibrary(lib.entries, { kind, query, source }) : []);
  // A selected item of yours stays openable even when a filter hides it.
  const selected = $derived(
    lib?.entries.find((e) => e.kind === kind && e.item.id === selectedId) ?? shown[0] ?? null,
  );

  const coaches = $derived.by(() => {
    const m = new Map<string, string>();
    for (const e of lib?.entries ?? []) if (e.source === "coach" && e.coach) m.set(e.coach.coachId, e.coach.coachName);
    return [...m];
  });

  async function load() {
    try {
      lib = await loadWebLibrary();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your library";
    }
  }
  onMount(load);

  function go(next: { kind?: LibraryKind; id?: string | null }) {
    const url = new URL(page.url);
    const k = next.kind ?? kind;
    if (k === "strength") url.searchParams.delete("kind");
    else url.searchParams.set("kind", k);
    if (next.id) url.searchParams.set("id", next.id);
    else url.searchParams.delete("id");
    void goto(url, { noScroll: true, keepFocus: true, replaceState: !next.kind });
  }

  async function save(item: LibraryItem) {
    try {
      await saveLibraryItem(item);
      await load();
      toast.success("Saved. It's on your phone after its next sync.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  async function remove(entry: LibraryEntry) {
    try {
      await deleteLibraryItem(entry.item.id);
      await load();
      go({ id: null });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete it");
    }
  }

  async function copy(entry: LibraryEntry) {
    if (!lib) return;
    // Same name for cardio and mobility (yours replaces it in every list); strength names
    // must be unique on the phone, so a copy of a LogIt or coach exercise gets "(mine)".
    let name = entry.kind === "strength" ? `${entry.item.name} (mine)` : entry.item.name;
    for (let n = 2; nameTaken(lib.own, entry.kind, name); n++) name = `${entry.item.name} (${n})`;
    const c = copyLibraryItem(entry, name);
    await save(c);
    go({ id: c.item.id });
  }

  async function create() {
    if (!lib || !newName.trim() || creating) return;
    creating = true;
    try {
      let item: LibraryItem;
      if (kind === "strength") {
        const now = Date.now();
        item = { kind: "strength", item: { id: createId("exdb"), name: newName.trim(), notes: null, isCore: false, createdAtMs: now, primaryMuscles: [], secondaryMuscles: [], exerciseType: "normal" } };
      } else if (kind === "cardio") {
        item = { kind: "cardio", item: newCardioActivity({ name: newName })};
      } else {
        item = { kind: "mobility", item: newMobilityDrill({ name: newName }) };
      }
      await saveLibraryItem(item);
      await load();
      newOpen = false;
      source = "all";
      go({ id: item.item.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add it");
    } finally {
      creating = false;
    }
  }

  const newClash = $derived(lib && newName.trim() ? nameTaken(lib.entries, kind, newName) : undefined);
  const NEW_LABEL: Record<LibraryKind, string> = { strength: "New exercise", cardio: "New cardio activity", mobility: "New mobility drill" };
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Library</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">
        Everything you can add to a workout: LogIt's, your own{coaches.length ? `, and what ${coaches.map(([, n]) => n).join(" and ")} shares with you` : ""}.
      </p>
    </div>
    <button type="button" onclick={() => { newName = ""; newOpen = true; }} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">{NEW_LABEL[kind]}</button>
  </header>

  <div class="flex flex-wrap items-center justify-between gap-2.5">
    <Tabs.Root value={kind} onValueChange={(v) => go({ kind: v as LibraryKind, id: null })}>
      <Tabs.List aria-label="Kind" class="h-auto w-auto rounded-[9px]">
        {#each LIBRARY_KINDS as k (k)}<Tabs.Trigger value={k} class="h-8 px-3.5 data-[state=active]:shadow-none rounded-lg data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground rounded-[7px]">{KIND_LABEL[k]}</Tabs.Trigger>{/each}
      </Tabs.List>
    </Tabs.Root>
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Show">
      {#each [["all", "All"], ["logit", "LogIt"], ["mine", "Mine"], ...coaches.map(([id, n]) => [`coach:${id}`, `From ${n}`])] as [value, label] (value)}
        <button type="button" aria-pressed={source === value} onclick={() => (source = value as typeof source)}
          class="h-7 rounded-full border px-3 text-xs {source === value ? 'border-border bg-muted text-foreground' : 'border-border/60 text-muted-foreground'}">{label}</button>
      {/each}
    </div>
  </div>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !lib}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-96 flex-[1_1_320px]" /><Skeleton class="h-96 flex-[999_1_520px]" /></div>
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <section aria-label="{KIND_LABEL[kind]} items" class="flex max-h-[calc(100vh-220px)] min-h-64 flex-[1_1_320px] flex-col gap-0.5 overflow-y-auto rounded-[10px] border border-border bg-card p-2.5">
        <label for="lib-q" class="sr-only">Search {KIND_LABEL[kind].toLowerCase()}</label>
        <input id="lib-q" bind:value={query} placeholder="Search {KIND_LABEL[kind].toLowerCase()}"
          class="mb-2 h-9 w-full shrink-0 rounded-lg border border-border bg-background px-2.5 text-sm" />
        {#each shown as e (e.item.id)}
          <button type="button" onclick={() => go({ id: e.item.id })} aria-current={selected?.item.id === e.item.id ? "true" : undefined}
            class="flex shrink-0 items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm {selected?.item.id === e.item.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
            <span class="min-w-0">
              <span class="block truncate">{e.item.name}</span>
              <span class="block truncate text-xs text-muted-foreground">{entryDetails(e)}</span>
            </span>
            {#if e.source !== "logit"}
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] {e.source === 'mine' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-200' : 'bg-violet-500/15 text-violet-700 dark:text-violet-200'}">{sourceLabel(e)}</span>
            {/if}
          </button>
        {:else}
          <p class="p-3 text-[13px] text-muted-foreground">{query ? "Nothing matches that." : source === "mine" ? "None of your own yet." : "Nothing here."}</p>
        {/each}
      </section>

      {#if selected}
        <section class="min-w-0 flex-[999_1_520px] rounded-[10px] border border-border bg-card px-[22px] py-5">
          {#key selected.kind + selected.item.id}
            <LibraryItemPanel entry={selected} own={lib.own} onSave={save} onDelete={() => remove(selected)} onCopy={() => copy(selected)} />
          {/key}
        </section>
      {/if}
    </div>
  {/if}
</div>

<Dialog.Root bind:open={newOpen}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{NEW_LABEL[kind]}</Dialog.Title>
      <Dialog.Description>Name it, then fill in the details. It reaches your phone on its next sync.</Dialog.Description>
    </Dialog.Header>
    <label for="new-name" class="sr-only">Name</label>
    <input id="new-name" bind:value={newName} placeholder="Name" onkeydown={(e) => { if (e.key === "Enter") void create(); }}
      class="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm" />
    {#if newClash}<p class="text-xs text-muted-foreground">"{newClash.item.name}" is already in the library ({sourceLabel(newClash)}).</p>{/if}
    <Dialog.Footer>
      <button type="button" onclick={() => (newOpen = false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
      <button type="button" disabled={!newName.trim() || creating || !!newClash} onclick={create}
        class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Add</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
