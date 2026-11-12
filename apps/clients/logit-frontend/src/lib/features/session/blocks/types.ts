import type { Component } from "svelte";
import type { WorkoutSession } from "@logit/core/domain/workout";

export type GripAction = (node: HTMLElement) => { destroy(): void };

export interface BlockBaseProps<T = unknown> {
  blockId: string;
  data: T;
  saving: boolean;
  /** True when this block is rendered inside a superset / circuit group. */
  grouped?: boolean;
  /**
   * The rest a set here starts when ticked, set by its superset / circuit: 0 = none
   * (straight on to the next exercise), a number = that rest. Undefined (not in a
   * group, or the group leaves it to the exercise) = the exercise's own rest.
   */
  groupRestMs?: number;
  gripAction: GripAction;
  /**
   * Opens the "Superset / circuit with…" picker for this block. Blocks show the
   * menu item only when it's given (the workout screen passes it).
   */
  onGroup?: () => void;
  onDelete: () => void | Promise<void>;
  onMutate: (updater: (session: WorkoutSession) => WorkoutSession) => Promise<void>;
}

export interface SessionBlockDefinition<T = unknown> {
  type: string;
  label: string;
  description?: string;
  component: Component<BlockBaseProps<T>>;
}
