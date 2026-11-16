import type { Component } from "svelte";

export type WidgetId = string;

export interface WidgetDefinition {
  /** Walkthrough mark (data-guide) for this widget on Home, if a tour points at it. */
  guideMark?: string;
  id: WidgetId;
  label: string;
  description: string;
  component: Component<any>;
  props?: Record<string, unknown>;
  defaultEnabled: boolean;
  defaultOrder: number;
}

export interface WidgetSlot {
  id: WidgetId;
  enabled: boolean;
  orderIndex: number;
}

export interface HomeConfig {
  slots: WidgetSlot[];
}
