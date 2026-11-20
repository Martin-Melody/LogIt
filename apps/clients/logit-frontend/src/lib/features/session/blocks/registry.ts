import type { SessionBlockDefinition } from "./types";

const registry = new Map<string, SessionBlockDefinition<any>>();

export function registerBlock<T>(def: SessionBlockDefinition<T>): void {
  registry.set(def.type, def);
}

export function getBlockDef(type: string): SessionBlockDefinition<any> | undefined {
  // Every plugin block (`plugin:<id>`) is drawn by the one generic component.
  return registry.get(type) ?? (type.startsWith("plugin:") ? registry.get("plugin:*") : undefined);
}

export function listBlockDefs(): SessionBlockDefinition<any>[] {
  return [...registry.values()];
}
