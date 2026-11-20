// "Train your way" (design canvas E3, experienced lifters): what sets the weights becomes the
// general progression algorithm, and every set asks how hard it was from the first one.
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { pushProgressionRecipe } from "$lib/sync/syncService";
import { bumpProgression } from "$lib/progression/store";
import { profile } from "$lib/stores/profile.store";
import { setProgressionAlgorithm } from "@logit/core/usecases/progression/getProgressionConfig";
import { saveProgressionRecipe } from "@logit/core/usecases/progression/progressionRecipes";
import { createProgressionRecipe, recipeAlgorithmId } from "@logit/core/domain/progressionRecipe";

export type TrainingStyle = "adaptive" | "wave" | "linear" | "own";

export const TRAINING_STYLES: { id: TrainingStyle; title: string; blurb: string }[] = [
  { id: "adaptive", title: "LogIt Adaptive", blurb: "Plans each set from your estimated max and how hard the last one felt" },
  { id: "wave", title: "5/3/1 waves", blurb: "Training max, four-week waves (5s, 3s, 5/3/1, light week)" },
  { id: "linear", title: "Linear", blurb: "One more rep each time; weight goes up when every set hits the top" },
  { id: "own", title: "Build my own", blurb: "Your own rules from blocks, set up before your first workout" },
];

/** "own" sets nothing here: the builder saves the algorithm and selects it. */
export async function applyTrainingStyle(style: TrainingStyle): Promise<void> {
  const deps = getProgressionDeps();
  if (style === "adaptive") await setProgressionAlgorithm("logit-adaptive", deps);
  if (style === "linear") await setProgressionAlgorithm("linear-progression", deps);
  if (style === "wave") {
    const row = await saveProgressionRecipe({ ...createProgressionRecipe("5/3/1 waves"), weightFrom: "wave" }, deps);
    pushProgressionRecipe(row);
    await setProgressionAlgorithm(recipeAlgorithmId(row.id), deps);
  }
  profile.save({ askEffortAfterSet: true });
  bumpProgression();
}
