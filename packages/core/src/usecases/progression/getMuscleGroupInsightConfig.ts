import type {
  MuscleGroupInsightAlgorithmMeta,
  UserMuscleGroupInsightConfig,
} from "../../domain/muscleGroupInsight";
import type { ProgressionDeps } from "./deps";

export const DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID = "learned-muscle-group-insight";

export type MuscleGroupInsightAlgorithmEntry = MuscleGroupInsightAlgorithmMeta & {
  hasPreferences: boolean;
};

export type MuscleGroupInsightConfigView = {
  config: UserMuscleGroupInsightConfig | null;
  activeAlgorithmId: string;
  algorithms: MuscleGroupInsightAlgorithmEntry[];
};

export async function getMuscleGroupInsightConfig(
  deps: Pick<ProgressionDeps, "progressionRepo" | "muscleGroupInsightAlgorithmRegistry">,
): Promise<MuscleGroupInsightConfigView> {
  const [config, metas] = await Promise.all([
    deps.progressionRepo.getMuscleGroupInsightConfig(),
    deps.muscleGroupInsightAlgorithmRegistry.list(),
  ]);
  const algorithms: MuscleGroupInsightAlgorithmEntry[] = await Promise.all(
    metas.map(async (meta) => {
      const full = await deps.muscleGroupInsightAlgorithmRegistry.get(meta.id);
      return { ...meta, hasPreferences: !!full?.preferencesSchema?.length };
    }),
  );
  return {
    config,
    activeAlgorithmId: config?.algorithmId ?? DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID,
    algorithms,
  };
}

export async function setMuscleGroupInsightAlgorithm(
  algorithmId: string,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  if (!algorithmId || algorithmId === DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID) {
    await deps.progressionRepo.clearMuscleGroupInsightConfig();
    return;
  }
  await deps.progressionRepo.saveMuscleGroupInsightConfig({ algorithmId });
}
