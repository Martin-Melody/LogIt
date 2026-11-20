<script lang="ts">
  // "Finish setting it up" (design canvas I3): an exercise made by name has no muscles, so it
  // counts toward no weekly sets. Asked once, in the workout, with guesses from the name picked.
  import { onMount, untrack } from "svelte";
  import { matchExercises } from "@logit/core/import/matchExercises";
  import { countSets, mergeOwnExercise } from "./mergeExercise";
  import { toast } from "$lib/components/ui/sonner";
  import { X } from "lucide-svelte";
  import { reveal } from "$lib/transitions";
  import { chip } from "$lib/components/ui/choice";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { pushExercise } from "$lib/sync/syncService";
  import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { guessExerciseSetup } from "@logit/core/domain/exerciseGuess";
  import { MUSCLE_LABELS } from "@logit/core/domain/weeklySets";
  import type { Equipment, Exercise, MuscleGroup } from "@logit/core/domain/exercise";

  let { exercise, onsaved, onmerged }: {
    exercise: Exercise;
    onsaved: (updated: Exercise) => void;
    /** Merged into a library exercise ("Same as Belt Squat?"): this one is gone. */
    onmerged?: (into: Exercise) => void;
  } = $props();

  // A library exercise this is probably the same as: offered first, since merging beats setting up.
  let same = $state<Exercise | null>(null);
  let confirming = $state<number | null>(null);
  let merging = $state(false);
  onMount(async () => {
    const library = await getExerciseRepo().list({ filter: "core", limit: 5000 }).catch(() => []);
    const [m] = matchExercises([start.name], library.map((e) => ({ id: e.id, name: e.name })));
    const id = m?.kind === "matched" ? m.exerciseId : m?.suggestion?.exerciseId;
    same = (id && library.find((e) => e.id === id)) || null;
  });
  async function askMerge() {
    confirming = await countSets({ id: start.id, name: start.name });
  }
  async function merge() {
    if (!same) return;
    merging = true;
    try {
      await mergeOwnExercise(exercise, same);
      toast(`${start.name} is now ${same.name}`);
      onmerged?.(same);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't merge them");
    } finally {
      merging = false;
    }
  }

  const HIDDEN_KEY = "logit:setup-hidden";
  const EQUIPMENT_CHOICES: [Equipment, string][] = [
    ["barbell", "Barbell"], ["dumbbell", "Dumbbells"], ["machine", "Machine"], ["cable", "Cable"],
    ["bodyweight", "Bodyweight"], ["kettlebell", "Kettlebell"], ["smith", "Smith machine"], ["band", "Band"], ["other", "Other"],
  ];
  const MUSCLES = Object.keys(MUSCLE_LABELS) as MuscleGroup[];

  // The parent keys this card by exercise, so the first values are the ones wanted.
  const start = untrack(() => ({ guess: guessExerciseSetup(exercise.name), equipment: exercise.equipment, id: exercise.id, name: exercise.name }));
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
    {#if same}
      {#if confirming == null}
        <button type="button" class="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm font-medium" onclick={() => void askMerge()}>
          <span>Same as {same.name}?</span><span class="text-muted-foreground">Merge ›</span>
        </button>
      {:else}
        <div class="flex flex-col gap-2 rounded-lg border border-border bg-background p-3" transition:reveal>
          <p class="text-sm">
            {#if confirming > 0}{confirming} logged set{confirming === 1 ? "" : "s"} of {start.name} become {same.name}'s, along with its place in your split and goals, and {start.name} is removed.
            {:else}{start.name} becomes {same.name} here and in your split and goals, and {start.name} is removed.{/if}
            This can't be undone.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="h-10 rounded-lg border border-border text-sm font-medium" disabled={merging} onclick={() => (confirming = null)}>Cancel</button>
            <button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={merging} onclick={() => void merge()}>Merge</button>
          </div>
        </div>
      {/if}
      <p class="text-xs font-semibold text-muted-foreground">Or set it up</p>
    {/if}
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
