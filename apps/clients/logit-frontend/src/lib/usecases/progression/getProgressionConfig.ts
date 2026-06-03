import { getProgressionRepo, getAlgorithmRegistry } from "$lib/data/repoProvider";
import type { ProgressionAlgorithmMeta, UserProgressionConfig } from "$lib/domain/progression";

export type ProgressionAlgorithmEntry = ProgressionAlgorithmMeta & {
  hasPreferences: boolean;
};

export type ProgressionConfigView = {
  config: UserProgressionConfig | null;
  algorithms: ProgressionAlgorithmEntry[];
};

export async function getProgressionConfig(): Promise<ProgressionConfigView> {
  const [config, registry] = await Promise.all([
    getProgressionRepo().getConfig(),
    getAlgorithmRegistry(),
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

export async function setProgressionAlgorithm(algorithmId: string): Promise<void> {
  if (!algorithmId) {
    await getProgressionRepo().clearConfig();
    return;
  }
  await getProgressionRepo().saveConfig({ algorithmId });
}
