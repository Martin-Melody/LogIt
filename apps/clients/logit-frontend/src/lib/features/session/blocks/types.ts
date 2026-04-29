import type { Component } from "svelte";
import type { WorkoutSession } from "$lib/domain/workout";

export interface BlockBaseProps<T = unknown> {
  data: T;
  saving: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void | Promise<void>;
  onMoveDown: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onMutate: (updater: (session: WorkoutSession) => WorkoutSession) => Promise<void>;
}

export interface SessionBlockDefinition<T = unknown> {
  type: string;
  label: string;
  description?: string;
  component: Component<BlockBaseProps<T>>;
}
