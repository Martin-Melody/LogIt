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
   * Whether completing a set here should start a rest timer. Defaults to true.
   * Superset members that aren't the last in the round pass `false` so you flow
   * straight into the next exercise — one shared rest per round, on the anchor.
   */
  restsOnComplete?: boolean;
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
