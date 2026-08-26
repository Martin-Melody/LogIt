import type { ProgressionAlgorithmMeta, UserProgressionConfig } from "../../domain/progression";
import type { ProgressionDeps } from "./deps";

export type ProgressionAlgorithmEntry = ProgressionAlgorithmMeta & {
  hasPreferences: boolean;
};

export type ProgressionConfigView = {
  config: UserProgressionConfig | null;
  algorithms: ProgressionAlgorithmEntry[];
};

export async function getProgressionConfig(
  deps: Pick<ProgressionDeps, "progressionRepo" | "algorithmRegistry">,
): Promise<ProgressionConfigView> {
  const [config, registry] = await Promise.all([
    deps.progressionRepo.getConfig(),
    deps.algorithmRegistry,
  ]);
  const metas = await registry.list();
  const algorithms: ProgressionAlgorithmEntry[] = await Promise.all(
    metas.map(async (meta) => {
      const full = await registry.get(meta.id);
      return { ...meta, hasPreferences: !!(full?.preferencesSchema?.length) };
    }),
  );
  return { config, algorithms };
}

export async function setProgressionAlgorithm(
  algorithmId: string,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  if (!algorithmId) {
    await deps.progressionRepo.clearConfig();
    return;
  }
  await deps.progressionRepo.saveConfig({ algorithmId });
}
