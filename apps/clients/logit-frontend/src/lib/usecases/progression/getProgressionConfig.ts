import { getProgressionRepo, getAlgorithmRegistry } from "$lib/data/repoProvider";
import type { ProgressionAlgorithmMeta, UserProgressionConfig } from "$lib/domain/progression";

export type ProgressionConfigView = {
  config: UserProgressionConfig | null;
  algorithms: ProgressionAlgorithmMeta[];
};

export async function getProgressionConfig(): Promise<ProgressionConfigView> {
  const [config, algorithms] = await Promise.all([
    getProgressionRepo().getConfig(),
    getAlgorithmRegistry().list(),
  ]);
  return { config, algorithms };
}

export async function setProgressionAlgorithm(algorithmId: string): Promise<void> {
  if (!algorithmId) {
    await getProgressionRepo().clearConfig();
    return;
  }
  await getProgressionRepo().saveConfig({ algorithmId });
}
