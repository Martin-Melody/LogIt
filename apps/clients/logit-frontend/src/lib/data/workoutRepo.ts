import type { WorkoutSession } from "$lib/domain/workout";
import type { SetTypeOption } from "./types";

export type ListRecentSessionsOptions = {
  limit: number;
};

export interface WorkoutRepo {
  saveSession(session: WorkoutSession): Promise<void>;
  getSession(id: string): Promise<WorkoutSession | null>;
  listRecentSessions(
    options: ListRecentSessionsOptions,
  ): Promise<WorkoutSession[]>;
  deleteSession(id: string): Promise<void>;

  saveDraftSession(session: WorkoutSession): Promise<void>;
  loadDraftSession(): Promise<WorkoutSession | null>;
  clearDraftSession(): Promise<void>;

  getSetTypes(): Promise<SetTypeOption[]>;
}
