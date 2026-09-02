import type { MuscleGroup } from "../../domain/exercise";
import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "Muscle Focus" — sets logged per muscle group over the last 7 days, as a body
 * map. The reference implementation of a built-in widget on the WidgetView
 * model: a pure function, same contract a community widget uses.
 */
export const muscleFocusWidget: WidgetPlugin = {
  id: "muscle-map",
  name: "Muscle Focus",
  description: "Body map showing which muscles you've trained this week.",
  needs: ["workouts", "exercises"],

  compute(input: WidgetInput): WidgetView {
    const exercisesByName = new Map(
      (input.exercises ?? []).map((e) => [e.name.toLowerCase(), e]),
    );
    const exercisesById = new Map((input.exercises ?? []).map((e) => [e.id, e]));

    const since = input.now - WEEK_MS;
    const counts: Partial<Record<MuscleGroup, number>> = {};
    const add = (m: MuscleGroup, n: number) => {
      counts[m] = (counts[m] ?? 0) + n;
    };

    let anySets = false;
    for (const workout of input.workouts ?? []) {
      if (!workout.endedAtMs || workout.endedAtMs < since) continue;
      for (const ex of workout.exercises) {
        const def = ex.exerciseId
          ? exercisesById.get(ex.exerciseId)
          : exercisesByName.get(ex.name.toLowerCase());
        if (!def) continue;
        const n = ex.sets.length;
        if (n === 0) continue;
        anySets = true;
        for (const m of def.primaryMuscles) add(m, n);
        for (const m of def.secondaryMuscles) add(m, n * 0.5);
      }
    }

    if (!anySets) {
      return {
        title: "Muscle Focus",
        subtitle: "Sets logged this week",
        body: [],
        empty: { text: "No sets logged this week yet.", action: { startEmptyWorkout: true } },
      };
    }

    return {
      title: "Muscle Focus",
      subtitle: "Sets logged this week",
      body: [
        {
          kind: "muscle-map",
          values: counts,
          scale: [1, 5, 12],
        },
      ],
      action: { navigate: "/progress" },
    };
  },
};
