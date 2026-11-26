<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Drawer } from "vaul-svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import type { Equipment, ExerciseType, MuscleGroup } from "@logit/core/domain/exercise";
  import { EQUIPMENT } from "@logit/core/domain/exercise";
  import type { MobilityArea } from "@logit/core/domain/mobilityDrill";
  import { MOBILITY_AREAS } from "@logit/core/domain/mobilityDrill";
  import type { CardioMeasure } from "@logit/core/domain/cardioActivity";
  import type { MobilityMetric } from "@logit/core/domain/workout";
  import {
    EQUIPMENT_LABEL,
    MOBILITY_AREA_LABEL,
    cleanCues,
    nameTaken,
    newCardioActivity,
    newMobilityDrill,
    type LibraryEntry,
    type LibraryKind,
  } from "@logit/core/domain/library";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { updateExercise } from "$lib/usecases/updateExercise";
  import { saveOwnItem } from "$lib/data/library/library";
  import CuesEditor from "./CuesEditor.svelte";
  import MusclePicker from "./MusclePicker.svelte";

  const { open, kind, entries, onOpenChange, onSaved } = $props<{
    open: boolean;
    kind: LibraryKind;
    /** The current library, to catch a name that's already taken. */
    entries: LibraryEntry[];
    onOpenChange: (v: boolean) => void;
    onSaved: (saved: { kind: LibraryKind; id: string }) => void;
  }>();

  let name = $state("");
  let notes = $state("");
  let cues = $state<string[]>([]);
  // strength
  let exerciseType = $state<ExerciseType>("normal");
  let equipment = $state<Equipment | "">("");
  let primary = $state<MuscleGroup[]>([]);
  let secondary = $state<MuscleGroup[]>([]);
  // cardio
  let measures = $state<CardioMeasure>("time-distance");
  // mobility
  let area = $state<MobilityArea>("hips");
  let metric = $state<MobilityMetric>("hold");
  let perSide = $state(false);

  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    name = "";
    notes = "";
    cues = [];
    exerciseType = "normal";
    equipment = "";
    primary = [];
    secondary = [];
    measures = "time-distance";
    area = "hips";
    metric = "hold";
    perSide = false;
    error = null;
  });

  const clash = $derived(name.trim() ? nameTaken(entries, kind, name) : undefined);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving || clash) return;
    saving = true;
    error = null;
    try {
      if (kind === "strength") {
        const created = await getExerciseRepo().create(trimmed, exerciseType);
        await updateExercise(created.id, {
          notes: notes.trim() || null,
          primaryMuscles: primary,
          secondaryMuscles: secondary,
          cues: cleanCues(cues),
          ...(equipment ? { equipment } : {}),
        });
        onSaved({ kind, id: created.id });
      } else if (kind === "cardio") {
        const item = newCardioActivity({ name: trimmed, measures, cues, notes });
        await saveOwnItem({ kind: "cardio", item });
        onSaved({ kind, id: item.id });
      } else {
        const item = newMobilityDrill({ name: trimmed, area, defaultMetric: metric, perSide, cues, notes });
        await saveOwnItem({ kind: "mobility", item });
        onSaved({ kind, id: item.id });
      }
      onOpenChange(false);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save it.";
    } finally {
      saving = false;
    }
  }

  const TITLE: Record<LibraryKind, string> = { strength: "New exercise", cardio: "New cardio activity", mobility: "New mobility drill" };
  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const input = "h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
</script>

<Drawer.Root {open} {onOpenChange} shouldScaleBackground={false}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-40 bg-black/40" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-xl border-t border-border bg-background">
      <span tabindex="0" aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"></span>
      <div class="mx-auto mb-2 mt-4 h-1 w-[100px] shrink-0 rounded-full bg-muted"></div>
      <div class="px-4 pb-2">
        <p class="text-base font-semibold">{TITLE[kind as LibraryKind]}</p>
        <p class="mt-0.5 text-xs text-muted-foreground">Saved to your library, so it's in the pickers next time.</p>
      </div>

      <div class="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="lib-name">Name</label>
          <input id="lib-name" type="text" class={input} bind:value={name}
            placeholder={kind === "strength" ? "e.g. Seal row" : kind === "cardio" ? "e.g. Sled drag" : "e.g. Hip airplane"} />
          {#if clash}
            <p class="text-xs text-muted-foreground">
              {clash.source === "mine" ? "You already have one called that." : `"${clash.item.name}" is already in the library. Open it and use "Make my own copy" to change it.`}
            </p>
          {/if}
        </div>

        {#if kind === "strength"}
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Muscles</span>
            <MusclePicker {primary} {secondary} onChange={(m) => { primary = m.primary; secondary = m.secondary; }} />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="lib-eq">Equipment</label>
            <Select.Root type="single" bind:value={() => equipment || "none", (v) => (equipment = (v === "none" ? "" : v) as typeof equipment)}>
              <Select.Trigger id="lib-eq" class="w-full">{equipment ? capitalise(EQUIPMENT_LABEL[equipment]) : "Not set"}</Select.Trigger>
              <Select.Content>
                <Select.Item value="none" label="Not set" />
                {#each EQUIPMENT as e (e)}<Select.Item value={e} label={capitalise(EQUIPMENT_LABEL[e])} />{/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Type</span>
            <div class={segmentTrack}>
              {#each ([["normal", "Normal"], ["assisted", "Assisted"], ["bodyweight", "Bodyweight"]] as [ExerciseType, string][]) as [t, label] (t)}
                <button type="button" class={segment(exerciseType === t)} aria-pressed={exerciseType === t} onclick={() => (exerciseType = t)}>{label}</button>
              {/each}
            </div>
          </div>
        {:else if kind === "cardio"}
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Measured by</span>
            <div class={segmentTrack}>
              <button type="button" class={segment(measures === "time-distance")} aria-pressed={measures === "time-distance"} onclick={() => (measures = "time-distance")}>Time and distance</button>
              <button type="button" class={segment(measures === "time")} aria-pressed={measures === "time"} onclick={() => (measures = "time")}>Time</button>
            </div>
          </div>
        {:else}
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="lib-area">Body area</label>
            <Select.Root type="single" bind:value={() => area, (v) => (area = v as MobilityArea)}>
            <Select.Trigger id="lib-area" class="w-full">{capitalise(MOBILITY_AREA_LABEL[area])}</Select.Trigger>
            <Select.Content>
              {#each MOBILITY_AREAS as a (a)}<Select.Item value={a} label={capitalise(MOBILITY_AREA_LABEL[a])} />{/each}
            </Select.Content>
          </Select.Root>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Measured by</span>
            <div class={segmentTrack}>
              <button type="button" class={segment(metric === "hold")} aria-pressed={metric === "hold"} onclick={() => (metric = "hold")}>Hold</button>
              <button type="button" class={segment(metric === "reps")} aria-pressed={metric === "reps"} onclick={() => (metric = "reps")}>Reps</button>
            </div>
          </div>
          <label class="flex h-10 items-center gap-2 text-sm">
            <Checkbox bind:checked={perSide} /> Each side separately
          </label>
        {/if}

        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Cues <span class="font-normal text-muted-foreground">(optional)</span></span>
          <CuesEditor {cues} onChange={(c) => (cues = c)} idPrefix="new-cue" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="lib-notes">Notes <span class="font-normal text-muted-foreground">(optional)</span></label>
          <textarea id="lib-notes" rows="2" class="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" bind:value={notes}></textarea>
        </div>

        {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

        <button
          type="button"
          class="w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!name.trim() || saving || !!clash}
          onclick={() => void save()}
        >
          {saving ? "Saving…" : `Add ${name.trim() || "item"}`}
        </button>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
