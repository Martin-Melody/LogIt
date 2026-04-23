import type { WidgetDefinition, WidgetId } from "./widget";

export interface WidgetRegistry {
  list(): WidgetDefinition[];
  get(id: WidgetId): WidgetDefinition | null;
}
