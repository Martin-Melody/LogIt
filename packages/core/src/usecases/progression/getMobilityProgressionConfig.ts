import type {
  MobilityProgressionAlgorithmMeta,
  UserMobilityProgressionConfig,
} from "../../domain/mobilityProgression";
import type { ProgressionDeps } from "./deps";

export const DEFAULT_MOBILITY_ALGORITHM_ID = "linear-mobility";

export type MobilityAlgorithmEntry = MobilityProgressionAlgorithmMeta & {
  hasPreferences: boolean;
};

export type MobilityProgressionConfigView = {
  config: UserMobilityProgressionConfig | null;
  activeAlgorithmId: string;
  algorithms: MobilityAlgorithmEntry[];
};

export async function getMobilityProgressionConfig(
  deps: Pick<ProgressionDeps, "progressionRepo" | "mobilityAlgorithmRegistry">,
): Promise<MobilityProgressionConfigView> {
  const [config, metas] = await Promise.all([
    deps.progressionRepo.getMobilityConfig(),
    deps.mobilityAlgorithmRegistry.list(),
  ]);
  const algorithms: MobilityAlgorithmEntry[] = await Promise.all(
    metas.map(async (meta) => {
      const full = await deps.mobilityAlgorithmRegistry.get(meta.id);
      return { ...meta, hasPreferences: !!full?.preferencesSchema?.length };
    }),
  );
  return {
    config,
    activeAlgorithmId: config?.algorithmId ?? DEFAULT_MOBILITY_ALGORITHM_ID,
    algorithms,
  };
}

export async function setMobilityProgressionAlgorithm(
  algorithmId: string,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  if (!algorithmId || algorithmId === DEFAULT_MOBILITY_ALGORITHM_ID) {
    await deps.progressionRepo.clearMobilityConfig();
    return;
  }
  await deps.progressionRepo.saveMobilityConfig({ algorithmId });
}
