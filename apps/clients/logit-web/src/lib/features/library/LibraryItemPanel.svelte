<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import type { Equipment, Exercise, ExerciseType, MuscleGroup } from "@logit/core/domain/exercise";
  import { EQUIPMENT } from "@logit/core/domain/exercise";
  import type { CardioActivity, CardioMeasure } from "@logit/core/domain/cardioActivity";
  import type { MobilityArea, MobilityDrill } from "@logit/core/domain/mobilityDrill";
  import { MOBILITY_AREAS } from "@logit/core/domain/mobilityDrill";
  import type { MobilityMetric } from "@logit/core/domain/workout";
  import {
    EQUIPMENT_LABEL,
    MOBILITY_AREA_LABEL,
    MUSCLE_LABEL,
    cleanCues,
    entryDetails,
    nameTaken,
    sourceLabel,
    type LibraryEntry,
    type LibraryItem,
  } from "@logit/core/domain/library";

  // One library item. Your own: an edit form with an explicit Save. LogIt's or a coach's:
  // read-only, with "Make my own copy".

  let { entry, own, usedIn = "", onSave, onDelete, onCopy }: {
    entry: LibraryEntry;
    /** Your own items, to catch a rename to a name you've already used. */
    own: LibraryEntry[];
    /** "Used in Sunday mobility" and the like. */
    usedIn?: string;
    onSave: (item: LibraryItem) => Promise<void>;
    onDelete: () => Promise<void>;
    onCopy: () => Promise<void>;
  } = $props();

  const mine = $derived(entry.source === "mine");

  let name = $state("");
  let notes = $state("");
  let cues = $state<string[]>([]);
  let primary = $state<MuscleGroup[]>([]);
  let secondary = $state<MuscleGroup[]>([]);
  let equipment = $state<Equipment | "">("");
  let exerciseType = $state<ExerciseType>("normal");
  let measures = $state<CardioMeasure>("time-distance");
  let area = $state<MobilityArea>("hips");
  let metric = $state<MobilityMetric>("hold");
  let perSide = $state(false);
  let busy = $state(false);
  let confirmDelete = $state(false);

  $effect.pre(() => {
    const e = entry;
    name = e.item.name;
    notes = (e.item as { notes: string | null }).notes ?? "";
    cues = [...((e.item as { cues?: string[] }).cues ?? [])];
    confirmDelete = false;
    if (e.kind === "strength") {
      primary = [...e.item.primaryMuscles];
      secondary = [...e.item.secondaryMuscles];
      equipment = e.item.equipment ?? "";
      exerciseType = e.item.exerciseType ?? "normal";
    } else if (e.kind === "cardio") {
      measures = e.item.measures;
    } else {
      area = e.item.area;
      metric = e.item.defaultMetric;
      perSide = e.item.perSide;
    }
  });

  const clash = $derived(name.trim() ? nameTaken(own, entry.kind, name, entry.item.id) : undefined);

  function cycleMuscle(m: MuscleGroup) {
    if (primary.includes(m)) {
      primary = primary.filter((x) => x !== m);
      secondary = [...secondary, m];
    } else if (secondary.includes(m)) {
      secondary = secondary.filter((x) => x !== m);
    } else {
      primary = [...primary, m];
    }
  }

  async function save() {
    if (!name.trim() || clash) return;
    busy = true;
    try {
      const base = { name: name.trim(), notes: notes.trim() || null, cues: cleanCues(cues) };
      if (entry.kind === "strength") {
        const item: Exercise = { ...entry.item, ...base, primaryMuscles: primary, secondaryMuscles: secondary, exerciseType };
        if (equipment) item.equipment = equipment;
        else delete item.equipment;
        await onSave({ kind: "strength", item });
      } else if (entry.kind === "cardio") {
        await onSave({ kind: "cardio", item: { ...(entry.item as CardioActivity), ...base, measures } });
      } else {
        await onSave({ kind: "mobility", item: { ...(entry.item as MobilityDrill), ...base, area, defaultMetric: metric, perSide } });
      }
    } finally {
      busy = false;
    }
  }

  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const input = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";
  const label = "mb-1.5 block text-xs font-medium text-muted-foreground";
  const segBtn = (on: boolean) =>
    `h-[30px] rounded-[7px] px-4 text-[13px] ${on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`;
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2.5">
      <span class="text-lg font-bold">{entry.item.name}</span>
      <span class="rounded-full px-2 py-0.5 text-[11px] {entry.source === 'mine' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-200' : entry.source === 'coach' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-200' : 'bg-muted text-muted-foreground'}">{sourceLabel(entry)}</span>
    </div>
    {#if usedIn}<span class="text-xs text-muted-foreground">{usedIn}</span>{/if}
  </div>

  {#if !mine}
    <p class="text-sm text-muted-foreground">{entryDetails(entry)}</p>
    {#if (entry.item as { cues?: string[] }).cues?.length}
      <div>
        <span class={label}>Cues</span>
        <ul class="flex list-disc flex-col gap-1 pl-5 text-sm">
          {#each (entry.item as { cues: string[] }).cues as cue, i (i)}<li>{cue}</li>{/each}
        </ul>
      </div>
    {/if}
    {#if (entry.item as { notes: string | null }).notes}
      <div>
        <span class={label}>Notes</span>
        <p class="whitespace-pre-line text-sm">{(entry.item as { notes: string }).notes}</p>
      </div>
    {/if}
    <div class="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <button type="button" disabled={busy} onclick={async () => { busy = true; try { await onCopy(); } finally { busy = false; } }}
        class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Make my own copy</button>
      <span class="text-xs text-muted-foreground">
        {entry.source === "coach" ? `${entry.coach?.coachName ?? "Your coach"} keeps this one up to date.` : "LogIt's items can't be changed."} A copy is yours to edit.
      </span>
    </div>
  {:else}
    <div class="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      <div>
        <label class={label} for="li-name">Name</label>
        <input id="li-name" class={input} bind:value={name} />
        {#if clash}<p class="mt-1 text-xs text-muted-foreground">You already have one called that.</p>{/if}
      </div>
      {#if entry.kind === "strength"}
        <div>
          <label class={label} for="li-eq">Equipment</label>
          <NativeSelect.Root id="li-eq" class="w-full" bind:value={equipment}>
            <NativeSelect.Option value="">Not set</NativeSelect.Option>
            {#each EQUIPMENT as e (e)}<NativeSelect.Option value={e}>{capitalise(EQUIPMENT_LABEL[e])}</NativeSelect.Option>{/each}
          </NativeSelect.Root>
        </div>
        <!-- Its own row: three words don't fit a third of the panel ("Bodyweight" spilled out). -->
        <div class="col-span-full">
          <span class={label}>Type</span>
          <div class="inline-flex gap-[3px] rounded-[9px] bg-muted p-[3px]">
            {#each ([["normal", "Normal"], ["assisted", "Assisted"], ["bodyweight", "Bodyweight"]] as const) as [t, l] (t)}
              <button type="button" class={segBtn(exerciseType === t)} aria-pressed={exerciseType === t} onclick={() => (exerciseType = t)}>{l}</button>
            {/each}
          </div>
        </div>
      {:else if entry.kind === "cardio"}
        <div>
          <span class={label}>Measured by</span>
          <div class="inline-grid grid-cols-2 gap-[3px] rounded-[9px] bg-muted p-[3px]">
            <button type="button" class={segBtn(measures === "time-distance")} aria-pressed={measures === "time-distance"} onclick={() => (measures = "time-distance")}>Time and distance</button>
            <button type="button" class={segBtn(measures === "time")} aria-pressed={measures === "time"} onclick={() => (measures = "time")}>Time</button>
          </div>
        </div>
      {:else}
        <div>
          <label class={label} for="li-area">Body area</label>
          <NativeSelect.Root id="li-area" class="w-full" bind:value={area}>
            {#each MOBILITY_AREAS as a (a)}<NativeSelect.Option value={a}>{capitalise(MOBILITY_AREA_LABEL[a])}</NativeSelect.Option>{/each}
          </NativeSelect.Root>
        </div>
        <div>
          <span class={label}>Measured by</span>
          <div class="inline-grid grid-cols-2 gap-[3px] rounded-[9px] bg-muted p-[3px]">
            <button type="button" class={segBtn(metric === "hold")} aria-pressed={metric === "hold"} onclick={() => (metric = "hold")}>Hold</button>
            <button type="button" class={segBtn(metric === "reps")} aria-pressed={metric === "reps"} onclick={() => (metric = "reps")}>Reps</button>
          </div>
        </div>
        <div>
          <span class={label}>Sides</span>
          <label class="flex h-9 items-center gap-2 text-sm"><Checkbox bind:checked={perSide} /> Each side separately</label>
        </div>
      {/if}
    </div>

    {#if entry.kind === "strength"}
      <div>
        <span class={label}>Muscles <span class="font-normal">(click once for a main muscle, twice for one it also works)</span></span>
        <div class="flex flex-wrap gap-1.5">
          {#each Object.keys(MUSCLE_LABEL) as MuscleGroup[] as m (m)}
            {@const s = primary.includes(m) ? "primary" : secondary.includes(m) ? "secondary" : "none"}
            <button type="button" onclick={() => cycleMuscle(m)}
              aria-label="{MUSCLE_LABEL[m]}: {s === 'primary' ? 'main muscle' : s === 'secondary' ? 'also works' : 'not used'}"
              class="h-7 rounded-full border px-3 text-xs capitalize {s === 'primary' ? 'border-primary bg-primary text-primary-foreground' : s === 'secondary' ? 'border-primary/50 bg-primary/10' : 'border-border text-muted-foreground'}">
              {MUSCLE_LABEL[m]}{s === "secondary" ? " ·2nd" : ""}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div>
      <span class={label}>Cues</span>
      <div class="flex flex-col gap-1.5">
        {#each cues as cue, i (i)}
          <div class="flex gap-2">
            <input class={input} value={cue} aria-label="Cue {i + 1}" placeholder="e.g. Elbows under the bar"
              oninput={(e) => (cues = cues.map((c, j) => (j === i ? (e.currentTarget as HTMLInputElement).value : c)))} />
            <button type="button" aria-label="Remove cue {i + 1}" onclick={() => (cues = cues.filter((_, j) => j !== i))}
              class="h-9 shrink-0 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground">✕</button>
          </div>
        {/each}
        <button type="button" onclick={() => (cues = [...cues, ""])} class="h-[30px] self-start rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">+ Add cue</button>
      </div>
    </div>

    <div>
      <label class={label} for="li-notes">Notes</label>
      <textarea id="li-notes" rows="3" class="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-sm" bind:value={notes}></textarea>
    </div>

    <div>
      <span class={label}>Photos and videos</span>
      <div class="rounded-[10px] border border-dashed border-border p-4 text-[13px] text-muted-foreground">
        Coming later: add a how-to clip or photos, shown when this is in a workout.
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      {#if confirmDelete}
        <span class="flex items-center gap-2 text-[13px]">
          Delete it? Past workouts keep the name.
          <button type="button" disabled={busy} onclick={async () => { busy = true; try { await onDelete(); } finally { busy = false; } }}
            class="h-[30px] rounded-lg bg-destructive px-2.5 text-xs font-semibold text-white disabled:opacity-50">Delete</button>
          <button type="button" onclick={() => (confirmDelete = false)} class="h-[30px] rounded-lg border border-border px-2.5 text-xs">Cancel</button>
        </span>
      {:else}
        <button type="button" onclick={() => (confirmDelete = true)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] font-medium hover:bg-muted">Delete</button>
      {/if}
      <button type="button" disabled={busy || !name.trim() || !!clash} onclick={save}
        class="h-[34px] rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Save</button>
    </div>
  {/if}
</div>
