<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { back } from "$lib/navigation";
  import { goto } from "$app/navigation";
  import { Copy, Trash2 } from "lucide-svelte";
  import type { CardioActivity, CardioMeasure } from "@logit/core/domain/cardioActivity";
  import type { MobilityArea, MobilityDrill } from "@logit/core/domain/mobilityDrill";
  import { MOBILITY_AREAS } from "@logit/core/domain/mobilityDrill";
  import type { MobilityMetric } from "@logit/core/domain/workout";
  import {
    KIND_LABEL,
    MOBILITY_AREA_LABEL,
    cleanCues,
    copyLibraryItem,
    entryDetails,
    nameTaken,
    sourceLabel,
    type LibraryEntry,
  } from "@logit/core/domain/library";
  import type { OwnLibraryItem } from "@logit/core/data/libraryRepo";
  import { deleteOwnItem, loadLibrary, saveOwnItem } from "$lib/data/library/library";
  import CuesEditor from "$lib/features/library/CuesEditor.svelte";

  const props = $props<{ params: { kind: string; id: string } }>();
  const kind = $derived<"cardio" | "mobility" | null>(
    props.params.kind === "cardio" || props.params.kind === "mobility" ? props.params.kind : null,
  );
  const id = $derived(decodeURIComponent(props.params.id));

  let all = $state<LibraryEntry[]>([]);
  let entry = $state<LibraryEntry | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);

  // Edit form (your own items only)
  let name = $state("");
  let notes = $state("");
  let cues = $state<string[]>([]);
  let measures = $state<CardioMeasure>("time-distance");
  let area = $state<MobilityArea>("hips");
  let metric = $state<MobilityMetric>("hold");
  let perSide = $state(false);

  const mine = $derived(entry?.source === "mine");

  async function load() {
    loading = true;
    try {
      all = kind ? await loadLibrary(kind) : [];
      entry = all.find((e) => e.item.id === id) ?? null;
      if (entry) fill(entry);
    } finally {
      loading = false;
    }
  }

  function fill(e: LibraryEntry) {
    name = e.item.name;
    notes = (e.item as { notes: string | null }).notes ?? "";
    cues = [...((e.item as { cues?: string[] }).cues ?? [])];
    if (e.kind === "cardio") measures = e.item.measures;
    if (e.kind === "mobility") {
      area = e.item.area;
      metric = e.item.defaultMetric;
      perSide = e.item.perSide;
    }
  }

  $effect(() => {
    void id;
    void kind;
    void load();
  });

  const clash = $derived(entry && name.trim() ? nameTaken(all.filter((e) => e.source === "mine"), entry.kind, name, entry.item.id) : undefined);

  async function save() {
    if (!entry || !mine || !name.trim() || clash) return;
    saving = true;
    error = null;
    saved = false;
    try {
      let next: OwnLibraryItem;
      if (entry.kind === "cardio") {
        const item: CardioActivity = { ...entry.item, name: name.trim(), measures, cues: cleanCues(cues), notes: notes.trim() || null };
        next = { kind: "cardio", item };
      } else {
        const item: MobilityDrill = {
          ...(entry.item as MobilityDrill),
          name: name.trim(),
          area,
          defaultMetric: metric,
          perSide,
          cues: cleanCues(cues),
          notes: notes.trim() || null,
        };
        next = { kind: "mobility", item };
      }
      await saveOwnItem(next);
      saved = true;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save it.";
    } finally {
      saving = false;
    }
  }

  async function makeCopy() {
    if (!entry || entry.kind === "strength") return;
    // Same name: your own replaces this one everywhere it's listed. Only one of your own
    // already called that needs a number.
    const mineNames = new Set(all.filter((e) => e.source === "mine").map((e) => e.item.name.toLowerCase()));
    let copyName = entry.item.name;
    for (let n = 2; mineNames.has(copyName.toLowerCase()); n++) copyName = `${entry.item.name} (${n})`;
    const copy = copyLibraryItem(entry, copyName) as OwnLibraryItem;
    await saveOwnItem(copy);
    void goto(`/exercises/${copy.kind}/${encodeURIComponent(copy.item.id)}`, { replaceState: true });
  }

  async function remove() {
    if (!entry || !mine) return;
    await deleteOwnItem(entry.item.id);
    back(`/exercises?kind=${entry.kind}`);
  }

  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const input = "h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back(kind ? `/exercises?kind=${kind}` : "/exercises")} />
    <div class="min-w-0 flex-1">
      <span class="block truncate text-base font-semibold">{entry?.item.name ?? (kind ? KIND_LABEL[kind] : "Library")}</span>
    </div>
  </PageHeader>

  {#if loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !entry}
    <p class="px-3 py-4 text-sm text-muted-foreground">Not in your library any more.</p>
  {:else if !mine}
    <!-- LogIt's, your coach's or a pack's: read-only -->
    <div class="flex flex-col gap-4 px-3 py-4">
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{sourceLabel(entry)}</span>
        <span class="text-sm text-muted-foreground">{entryDetails(entry)}</span>
      </div>
      {#if (entry.item as { cues?: string[] }).cues?.length}
        <section>
          <h2 class="mb-1.5 text-sm font-medium">Cues</h2>
          <ul class="flex list-disc flex-col gap-1 pl-5 text-sm">
            {#each (entry.item as { cues: string[] }).cues as cue, i (i)}<li>{cue}</li>{/each}
          </ul>
        </section>
      {/if}
      {#if (entry.item as { notes: string | null }).notes}
        <section>
          <h2 class="mb-1.5 text-sm font-medium">Notes</h2>
          <p class="whitespace-pre-line text-sm">{(entry.item as { notes: string }).notes}</p>
        </section>
      {/if}
      <button type="button" class="inline-flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium" onclick={() => void makeCopy()}>
        <Copy class="h-4 w-4" /> Make my own copy
      </button>
      <p class="text-xs text-muted-foreground">
        {entry.source === "coach" ? `${entry.coach?.coachName ?? "Your coach"} keeps this one up to date.` : "LogIt's items can't be changed."}
        A copy is yours to edit.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-4 px-3 py-4">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="item-name">Name</label>
        <input id="item-name" type="text" class={input} bind:value={name} />
        {#if clash}<p class="text-xs text-muted-foreground">You already have one called that.</p>{/if}
      </div>

      {#if entry.kind === "cardio"}
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Measured by</span>
          <div class={segmentTrack}>
            <button type="button" class={segment(measures === "time-distance")} aria-pressed={measures === "time-distance"} onclick={() => (measures = "time-distance")}>Time and distance</button>
            <button type="button" class={segment(measures === "time")} aria-pressed={measures === "time"} onclick={() => (measures = "time")}>Time</button>
          </div>
        </div>
      {:else}
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="item-area">Body area</label>
          <select id="item-area" class={input} bind:value={area}>
            {#each MOBILITY_AREAS as a (a)}<option value={a}>{capitalise(MOBILITY_AREA_LABEL[a])}</option>{/each}
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Measured by</span>
          <div class={segmentTrack}>
            <button type="button" class={segment(metric === "hold")} aria-pressed={metric === "hold"} onclick={() => (metric = "hold")}>Hold</button>
            <button type="button" class={segment(metric === "reps")} aria-pressed={metric === "reps"} onclick={() => (metric = "reps")}>Reps</button>
          </div>
        </div>
        <label class="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" class="h-4 w-4" bind:checked={perSide} /> Each side separately
        </label>
      {/if}

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Cues</span>
        <CuesEditor {cues} onChange={(c) => (cues = c)} />
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="item-notes">Notes</label>
        <textarea id="item-notes" rows="3" class="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" bind:value={notes}></textarea>
      </div>

      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

      <div class="flex gap-2">
        <button type="button" class="inline-flex h-11 items-center gap-2 rounded-md border px-4 text-sm" onclick={() => (confirmDelete = true)}>
          <Trash2 class="h-4 w-4" /> Delete
        </button>
        <button type="button" class="h-11 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={saving || !name.trim() || !!clash} onclick={() => void save()}>
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      <p class="text-xs text-muted-foreground">Deleting it keeps it in past workouts.</p>
    </div>
  {/if}
</div>

<ConfirmDialog
  open={confirmDelete}
  onOpenChange={(v) => (confirmDelete = v)}
  title="Delete {entry?.item.name ?? 'this'}?"
  description="It goes from your library. Workouts you've already logged keep it."
  confirmLabel="Delete"
  onConfirm={remove}
/>
