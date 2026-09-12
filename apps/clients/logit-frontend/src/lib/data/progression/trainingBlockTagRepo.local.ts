import { browser } from "$app/environment";
import type { TrainingBlockTagRepo } from "@logit/core/data/trainingBlockTagRepo";
import type { TrainingBlockTag } from "@logit/core/domain/trainingBlockTag";

const STORAGE_KEY = "logit:progression:trainingBlockTags:v1"; // Record<id, TrainingBlockTag>

function ensureBrowser(): void {
  if (!browser) throw new Error("localStorage repo cannot be used during SSR.");
}

function readAll(): Record<string, TrainingBlockTag> {
  ensureBrowser();
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, TrainingBlockTag>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, TrainingBlockTag>): void {
  ensureBrowser();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function keyOf(tag: Pick<TrainingBlockTag, "exerciseId" | "exerciseName">): string {
  return tag.exerciseId ?? tag.exerciseName.toLowerCase().trim();
}

export function createLocalTrainingBlockTagRepo(): TrainingBlockTagRepo {
  return {
    async listForExercise(key: string): Promise<TrainingBlockTag[]> {
      return Object.values(readAll())
        .filter((t) => keyOf(t) === key)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },

    async create(tag: TrainingBlockTag): Promise<void> {
      const map = readAll();
      map[tag.id] = tag;
      writeAll(map);
    },

    async update(tag: TrainingBlockTag): Promise<void> {
      const map = readAll();
      if (!map[tag.id]) return;
      map[tag.id] = tag;
      writeAll(map);
    },

    async delete(id: string): Promise<void> {
      const map = readAll();
      delete map[id];
      writeAll(map);
    },
  };
}
