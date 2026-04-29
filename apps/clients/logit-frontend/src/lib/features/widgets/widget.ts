import type { Component } from "svelte";

export type WidgetId = string;

export interface WidgetDefinition {
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
