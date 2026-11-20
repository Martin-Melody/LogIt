import type { Component } from "svelte";
import type { WorkoutSession } from "@logit/core/domain/workout";

export type GripAction = (node: HTMLElement) => { destroy(): void };

export interface BlockBaseProps<T = unknown> {
  blockId: string;
  /** The block's type (a plugin block's says which plugin: `plugin:<id>`). */
  blockType?: string;
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
  /**
   * Show only this round (0-based) of the block: its set for that round, for a group's
   * "by round" view. Undefined = the whole block. Blocks without rounds ignore it.
   */
  round?: number;
  gripAction: GripAction;
  /**
   * Opens the "Superset / circuit with…" picker for this block. Blocks show the
   * menu item only when it's given (the workout screen passes it).
   */
  onGroup?: () => void;
  onDelete: () => void | Promise<void>;
  onMutate: (updater: (session: WorkoutSession) => WorkoutSession, opts?: { auto?: boolean }) => Promise<void>;
}

export interface SessionBlockDefinition<T = unknown> {
  type: string;
  label: string;
  description?: string;
  component: Component<BlockBaseProps<T>>;
}
