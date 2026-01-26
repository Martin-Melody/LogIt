import type { WorkoutSession } from "$lib/domain/workout";

export type ListRecentSessionsOptions = {
  limit: number;
};

export interface WorkoutRepo {
  // Sessions (finished)
  saveSession(session: WorkoutSession): Promise<void>;
  getSession(id: string): Promise<WorkoutSession | null>;
  listRecentSessions(
    options: ListRecentSessionsOptions,
  ): Promise<WorkoutSession[]>;
  deleteSession(id: string): Promise<void>;

  // Draft (in-progress)
  saveDraftSession(session: WorkoutSession): Promise<void>;
  loadDraftSession(): Promise<WorkoutSession | null>;
  clearDraftSession(): Promise<void>;
}
