import type { Component } from "svelte";
import type { WorkoutSession } from "$lib/domain/workout";

export type GripAction = (node: HTMLElement) => { destroy(): void };

export interface BlockBaseProps<T = unknown> {
  blockId: string;
  data: T;
  saving: boolean;
  gripAction: GripAction;
  onDelete: () => void | Promise<void>;
  onMutate: (updater: (session: WorkoutSession) => WorkoutSession) => Promise<void>;
}

export interface SessionBlockDefinition<T = unknown> {
  type: string;
  label: string;
  description?: string;
  component: Component<BlockBaseProps<T>>;
}
