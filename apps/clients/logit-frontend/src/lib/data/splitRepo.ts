import type { WorkoutSplit } from "$lib/domain/WorkoutSplit";

export type ListSplitsOptions = {
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
  search?: string;
  sortBy?: "updated" | "created" | "name";
  order?: "asc" | "desc";
};


export interface SplitRepo {
  saveSplit(split: WorkoutSplit): Promise<void>;
  getSplit(id: string): Promise<WorkoutSplit | null>;
  getListSplits(options?: ListSplitsOptions): Promise<WorkoutSplit[]>;
  deleteSplit(id: string): Promise<void>;

  setActiveSplitId(id: string | null): Promise<void>;
  getActiveSplitId(): Promise<string | null>;
}
