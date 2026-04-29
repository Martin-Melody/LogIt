import type { SessionBlockDefinition } from "./types";

const registry = new Map<string, SessionBlockDefinition<any>>();

export function registerBlock<T>(def: SessionBlockDefinition<T>): void {
  registry.set(def.type, def);
}

export function getBlockDef(type: string): SessionBlockDefinition<any> | undefined {
  return registry.get(type);
}

export function listBlockDefs(): SessionBlockDefinition<any>[] {
  return [...registry.values()];
}
