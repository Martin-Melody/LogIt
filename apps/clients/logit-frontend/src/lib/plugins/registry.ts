import type { PluginFamily } from "./types";

export type RegistryEntry = {
  id: string;
  name: string;
  description: string;
  family: PluginFamily;
  author?: string;
  manifestUrl: string;
  tags?: string[];
  featured?: boolean;
};

const REGISTRY_URL = import.meta.env.DEV
  ? "/sample-plugins/registry.json"
  : "https://martin-melody.github.io/logit-plugin-registry/registry.json";

export async function fetchRegistry(): Promise<RegistryEntry[]> {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`Registry unavailable (${res.status})`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Invalid registry format");
  return data as RegistryEntry[];
}
