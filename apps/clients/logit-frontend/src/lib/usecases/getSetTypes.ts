import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { SetTypeOption } from "@logit/core/data/types";

export async function getSetTypes(): Promise<SetTypeOption[]> {
  return getWorkoutRepo().getSetTypes();
}
