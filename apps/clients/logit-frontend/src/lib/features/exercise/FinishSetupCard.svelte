<script lang="ts">
  // "Finish setting it up" (design canvas I3): an exercise made by name has no muscles, so it
  // counts toward no weekly sets. Asked once, in the workout, with guesses from the name picked.
  import { untrack } from "svelte";
  import { X } from "lucide-svelte";
  import { reveal } from "$lib/transitions";
  import { chip } from "$lib/components/ui/choice";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { pushExercise } from "$lib/sync/syncService";
  import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { guessExerciseSetup } from "@logit/core/domain/exerciseGuess";
  import { MUSCLE_LABELS } from "@logit/core/domain/weeklySets";
  import type { Equipment, Exercise, MuscleGroup } from "@logit/core/domain/exercise";

  let { exercise, onsaved }: { exercise: Exercise; onsaved: (updated: Exercise) => void } = $props();

  const HIDDEN_KEY = "logit:setup-hidden";
  const EQUIPMENT_CHOICES: [Equipment, string][] = [
    ["barbell", "Barbell"], ["dumbbell", "Dumbbells"], ["machine", "Machine"], ["cable", "Cable"],
    ["bodyweight", "Bodyweight"], ["kettlebell", "Kettlebell"], ["smith", "Smith machine"], ["band", "Band"], ["other", "Other"],
  ];
  const MUSCLES = Object.keys(MUSCLE_LABELS) as MuscleGroup[];

  // The parent keys this card by exercise, so the first values are the ones wanted.
  const start = untrack(() => ({ guess: guessExerciseSetup(exercise.name), equipment: exercise.equipment, id: exercise.id }));
  let muscles = $state<MuscleGroup[]>(start.guess.primaryMuscles);
  let equipment = $state<Equipment | undefined>(start.equipment ?? start.guess.equipment);
  let hidden = $state(hiddenIds().includes(start.id));
  let saving = $state(false);
  // The usual few first; "More…" shows the rest (design canvas I3).
  let allMuscles = $state(false);
  let allEquipment = $state(false);
  const COMMON_MUSCLES: MuscleGroup[] = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes"];
  const COMMON_EQUIPMENT: Equipment[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight"];
  const shownMuscles = $derived(allMuscles ? MUSCLES : MUSCLES.filter((m) => COMMON_MUSCLES.includes(m) || muscles.includes(m)));
  const shownEquipment = $derived(allEquipment ? EQUIPMENT_CHOICES : EQUIPMENT_CHOICES.filter(([e]) => COMMON_EQUIPMENT.includes(e) || equipment === e));

  function hiddenIds(): string[] {
    try {
      return JSON.parse(getAccountItem(HIDDEN_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  }
  function hide() {
    setAccountItem(HIDDEN_KEY, JSON.stringify([...hiddenIds(), exercise.id]));
    hidden = true;
  }
  function toggle(m: MuscleGroup) {
    muscles = muscles.includes(m) ? muscles.filter((x) => x !== m) : [...muscles, m];
  }
  async function save() {
    saving = true;
    try {
      const updated = await getExerciseRepo().update(exercise.id, { primaryMuscles: muscles, ...(equipment ? { equipment } : {}) });
      pushExercise(updated);
      onsaved(updated);
    } finally {
      saving = false;
    }
  }
</script>

{#if !hidden}
  <div class="mx-3 my-2 flex flex-col gap-2.5 rounded-lg bg-muted px-3 py-3" transition:reveal>
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-col gap-0.5">
        <p class="text-sm font-semibold">Finish setting it up</p>
        <p class="text-xs text-muted-foreground">So it counts toward the right muscles each week.</p>
      </div>
      <button type="button" class="-mr-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground" aria-label="Not now" onclick={hide}>
        <X class="h-4 w-4" />
      </button>
    </div>
    <p class="text-xs font-semibold text-muted-foreground">Main muscles</p>
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Main muscles">
      {#each shownMuscles as m (m)}
        <button type="button" aria-pressed={muscles.includes(m)} class={chip(muscles.includes(m), "h-9 px-3 text-[13px]")} onclick={() => toggle(m)}>{MUSCLE_LABELS[m]}</button>
      {/each}
      {#if !allMuscles}<button type="button" class={chip(false, "h-9 px-3 text-[13px] border-dashed")} onclick={() => (allMuscles = true)}>More…</button>{/if}
    </div>
    <p class="text-xs font-semibold text-muted-foreground">Done with</p>
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Equipment">
      {#each shownEquipment as [e, label] (e)}
        <button type="button" aria-pressed={equipment === e} class={chip(equipment === e, "h-9 px-3 text-[13px]")} onclick={() => (equipment = equipment === e ? undefined : e)}>{label}</button>
      {/each}
      {#if !allEquipment}<button type="button" class={chip(false, "h-9 px-3 text-[13px] border-dashed")} onclick={() => (allEquipment = true)}>More…</button>{/if}
    </div>
    <button type="button" class="h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      disabled={saving || muscles.length === 0} onclick={() => void save()}>Save</button>
  </div>
{/if}
