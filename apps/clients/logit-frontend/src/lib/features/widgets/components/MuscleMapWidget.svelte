<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
  import { getExercises } from "@logit/core/domain/workout";
  import type { MuscleGroup } from "@logit/core/domain/exercise";
  import { FRONT_MUSCLES, BACK_MUSCLES } from "body-muscles";

  const ALL_MUSCLES: MuscleGroup[] = [
    "chest", "back", "shoulders", "biceps", "triceps",
    "quads", "hamstrings", "glutes", "calves", "core", "forearms",
  ];

  // Map our domain MuscleGroup to body-muscles path IDs
  const MUSCLE_ID_MAP: Record<MuscleGroup, string[]> = {
    chest: [
      "chest-upper-left", "chest-lower-left", "chest-upper-right", "chest-lower-right",
      "serratus-anterior-left", "serratus-anterior-right",
    ],
    back: [
      "lats-upper-left", "lats-mid-left", "lats-lower-left",
      "lats-upper-right", "lats-mid-right", "lats-lower-right",
      "traps-upper-left", "traps-mid-left", "traps-lower-left",
      "traps-upper-right", "traps-mid-right", "traps-lower-right",
      "lower-back-erectors-left", "lower-back-ql-left",
      "lower-back-erectors-right", "lower-back-ql-right",
      "spine",
    ],
    shoulders: [
      "shoulder-front-left", "shoulder-side-left",
      "shoulder-front-right", "shoulder-side-right",
      "deltoid-rear-left", "deltoid-rear-right",
    ],
    biceps:     ["biceps-left", "biceps-right"],
    triceps:    ["triceps-long-left", "triceps-lateral-left", "triceps-long-right", "triceps-lateral-right"],
    quads:      ["quads-left", "quads-right"],
    hamstrings: [
      "hamstrings-medial-left", "hamstrings-lateral-left",
      "hamstrings-medial-right", "hamstrings-lateral-right",
    ],
    glutes:     ["gluteus-medius-left", "gluteus-maximus-left", "gluteus-medius-right", "gluteus-maximus-right"],
    calves:     [
      "calves-gastroc-medial-left", "calves-gastroc-lateral-left", "calves-soleus-left",
      "calves-gastroc-medial-right", "calves-gastroc-lateral-right", "calves-soleus-right",
    ],
    core:       [
      "abs-upper-left", "abs-upper-right", "abs-lower-left", "abs-lower-right",
      "obliques-left", "obliques-right",
    ],
    forearms:   [
      "forearm-left", "forearm-right",
      "forearm-flexors-left", "forearm-extensors-left",
      "forearm-flexors-right", "forearm-extensors-right",
    ],
  };

  // Reverse map: body-muscles ID → our MuscleGroup
  const ID_TO_GROUP = new Map<string, MuscleGroup>();
  for (const [group, ids] of Object.entries(MUSCLE_ID_MAP) as [MuscleGroup, string[]][]) {
    for (const id of ids) ID_TO_GROUP.set(id, group);
  }

  let setCounts = $state<Record<MuscleGroup, number>>(
    Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0])) as Record<MuscleGroup, number>,
  );
  let loading = $state(true);

  onMount(async () => {
    try {
      const workoutRepo = getWorkoutRepo();
      const exerciseRepo = getExerciseRepo();
      const allSessions = await workoutRepo.listAllSessions();

      const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const thisWeek = allSessions.filter((s) => s.endedAtMs && s.endedAtMs >= weekAgoMs);

      const counts = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0])) as Record<MuscleGroup, number>;

      for (const session of thisWeek) {
        for (const ex of getExercises(session)) {
          const def = ex.exerciseId
            ? await exerciseRepo.getById(ex.exerciseId)
            : await exerciseRepo.getByName(ex.exerciseName);
          if (!def) continue;

          const n = ex.sets.length;
          for (const m of def.primaryMuscles) counts[m] += n;
          for (const m of def.secondaryMuscles) counts[m] += n * 0.5;
        }
      }

      setCounts = counts;
    } finally {
      loading = false;
    }
  });

  function muscleFill(id: string): string {
    const group = ID_TO_GROUP.get(id);
    if (!group) return "var(--muscle-base)";
    const n = setCounts[group];
    if (n === 0) return "var(--muscle-base)";
    if (n < 5)  return "var(--muscle-low)";
    if (n < 12) return "var(--muscle-med)";
    return "var(--muscle-high)";
  }

  function muscleTitle(id: string): string {
    const group = ID_TO_GROUP.get(id);
    if (!group) return "";
    const n = Math.round(setCounts[group]);
    const label = group.charAt(0).toUpperCase() + group.slice(1);
    return `${label}: ${n} set${n === 1 ? "" : "s"} this week`;
  }
</script>

<style>
  .muscle-map {
    /* Dark-mode defaults (app is primarily dark) */
    --muscle-base: oklch(0.28 0.015 260);
    --muscle-low:  oklch(0.38 0.14 145);
    --muscle-med:  oklch(0.55 0.19 145);
    --muscle-high: oklch(0.72 0.22 145);
    --muscle-stroke: oklch(0.20 0.01 260);
  }

  :global(.light) .muscle-map {
    --muscle-base: oklch(0.80 0.015 260);
    --muscle-low:  oklch(0.65 0.13 145);
    --muscle-med:  oklch(0.50 0.18 145);
    --muscle-high: oklch(0.35 0.18 145);
    --muscle-stroke: oklch(0.40 0.02 260);
  }

  svg path {
    stroke: var(--muscle-stroke);
    stroke-width: 0.15;
    transition: fill 300ms ease;
  }
</style>

<Card.Root>
  <Card.Header class="pb-2">
    <Card.Title>Muscle Focus</Card.Title>
    <Card.Description>Sets logged this week</Card.Description>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else}
      <div class="muscle-map flex justify-center gap-4">

        <!-- Front view -->
        <div class="flex flex-col items-center gap-1">
          <span class="text-[10px] text-muted-foreground uppercase tracking-widest">Front</span>
          <svg viewBox="0 0 35 93" width="110" height="auto" aria-label="Front body muscle map" role="img">
            {#each FRONT_MUSCLES as m (m.id)}
              <path
                d={m.path}
                fill={muscleFill(m.id)}
                aria-label={muscleTitle(m.id) || m.name}
              >
                {#if ID_TO_GROUP.has(m.id)}
                  <title>{muscleTitle(m.id)}</title>
                {/if}
              </path>
            {/each}
          </svg>
        </div>

        <!-- Back view -->
        <div class="flex flex-col items-center gap-1">
          <span class="text-[10px] text-muted-foreground uppercase tracking-widest">Back</span>
          <svg viewBox="37 0 35 93" width="110" height="auto" aria-label="Back body muscle map" role="img">
            {#each BACK_MUSCLES as m (m.id)}
              <path
                d={m.path}
                fill={muscleFill(m.id)}
                aria-label={muscleTitle(m.id) || m.name}
              >
                {#if ID_TO_GROUP.has(m.id)}
                  <title>{muscleTitle(m.id)}</title>
                {/if}
              </path>
            {/each}
          </svg>
        </div>

      </div>

      <!-- Legend -->
      <div class="muscle-map flex items-center justify-center gap-3 mt-3">
        {#each [
          ["var(--muscle-base)", "None"],
          ["var(--muscle-low)",  "Light"],
          ["var(--muscle-med)",  "Moderate"],
          ["var(--muscle-high)", "Heavy"],
        ] as [color, label] (label)}
          <div class="flex items-center gap-1">
            <div class="w-2.5 h-2.5 rounded-[2px] shrink-0" style="background: {color}"></div>
            <span class="text-[10px] text-muted-foreground">{label}</span>
          </div>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
