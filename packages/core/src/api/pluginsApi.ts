import { apiClient } from "./client";

/**
 * Plugins on this LogIt server: the reviewed registry, plugins shared by link, the plugins you
 * build on the dashboard, and the installed-plugins list that syncs between your devices.
 */

/** A registry entry as /plugins/registry.json serves it (a superset of the static format). */
export type HostedRegistryEntry = {
  id: string;
  name: string;
  description: string;
  family: string;
  author?: string;
  manifestUrl: string;
  version?: string;
  needs?: string[] | null;
  changeNote?: string | null;
  reviewedAt?: string | null;
  reviewed?: boolean;
  tags?: string[];
};

/** A manifest as the server serves it (distribution + integrity filled in). */
export type ServedManifest = {
  id: string;
  family: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  needs?: string[];
  integrity: string;
  distribution: { origin: "url"; manifestUrl: string; bundleUrl: string };
  capabilities: Array<Record<string, unknown>>;
};

export type ListedPlugin = {
  manifest: ServedManifest;
  author: string;
  versions: { version: string; changeNote: string | null; reviewedAt: string | null }[];
};

export type LinkedPlugin = {
  manifest: ServedManifest;
  author: string;
  reviewed: boolean;
  changeNote: string | null;
};

export type ReleaseStatus = "pending" | "approved" | "rejected" | "unlisted" | "withdrawn";

export type MyPluginRelease = {
  id: string;
  version: string;
  status: ReleaseStatus;
  changeNote: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type MyPlugin = {
  pluginId: string;
  family: string;
  name: string;
  draftUpdatedAtMs: number;
  /** Only on the single-plugin calls. */
  draftManifestJson: string | null;
  draftSource: string | null;
  /** What "Try on my phone" installs (single-plugin calls only). */
  draftManifest: ServedManifest | null;
  linkToken: string | null;
  releases: MyPluginRelease[];
};

/** The builder's own manifest fields; the server fills in the rest when it serves a version. */
export type DraftManifest = {
  name: string;
  description: string;
  needs?: string[];
  version?: string;
};

/** One installed plugin, synced per account (the server stores dataJson as-is). */
export type RemotePluginInstall = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

const enc = encodeURIComponent;

export const pluginsApi = {
  // ── Public ────────────────────────────────────────────────────────────────

  /** URL of this server's registry, for the app's list of registry sources. */
  registryUrl(): string {
    return `${apiClient.getBaseUrl()}/plugins/registry.json`;
  },

  registry(): Promise<HostedRegistryEntry[]> {
    return apiClient.fetch("/plugins/registry.json");
  },

  listed(pluginId: string): Promise<ListedPlugin> {
    return apiClient.fetch(`/plugins/r/${enc(pluginId)}`);
  },

  byLink(token: string): Promise<LinkedPlugin> {
    return apiClient.fetch(`/plugins/link/${enc(token)}`);
  },

  // ── Yours (Pro) ───────────────────────────────────────────────────────────

  mine(): Promise<{ plugins: MyPlugin[] }> {
    return apiClient.fetch("/plugins/mine");
  },

  get(pluginId: string): Promise<MyPlugin> {
    return apiClient.fetch(`/plugins/mine/${enc(pluginId)}`);
  },

  create(pluginId: string, family: string, manifest: DraftManifest, source: string): Promise<MyPlugin> {
    return apiClient.fetch("/plugins/mine", {
      method: "POST",
      body: JSON.stringify({ pluginId, family, manifestJson: JSON.stringify(manifest), source }),
    });
  },

  /** Save the draft. `baseUpdatedAtMs` makes the server refuse if it was saved elsewhere since. */
  save(pluginId: string, manifest: DraftManifest, source: string, baseUpdatedAtMs?: number): Promise<MyPlugin> {
    return apiClient.fetch(`/plugins/mine/${enc(pluginId)}`, {
      method: "PUT",
      body: JSON.stringify({ manifestJson: JSON.stringify(manifest), source, baseUpdatedAtMs }),
    });
  },

  remove(pluginId: string): Promise<void> {
    return apiClient.fetch(`/plugins/mine/${enc(pluginId)}`, { method: "DELETE" });
  },

  /** `listed`: ask for a spot in Browse (waits for review); otherwise share by link now. */
  publish(pluginId: string, version: string, changeNote: string, listed: boolean): Promise<MyPlugin> {
    return apiClient.fetch(`/plugins/mine/${enc(pluginId)}/releases`, {
      method: "POST",
      body: JSON.stringify({ version, changeNote, listed }),
    });
  },

  // ── Installed plugins (sync, Pro) ──────────────────────────────────────────

  pushInstalls(plugins: RemotePluginInstall[]): Promise<void> {
    return apiClient.fetch("/sync/plugins", { method: "POST", body: JSON.stringify({ plugins }) });
  },

  pullInstalls(since: number): Promise<{ plugins: RemotePluginInstall[] }> {
    return apiClient.fetch(`/sync/plugins?since=${since}`);
  },
};

/** The link token in a pasted share link (…/plugins/link/<token>), or null. */
export function linkTokenFromUrl(text: string): string | null {
  const m = text.trim().match(/\/plugins\/link\/([A-Za-z0-9_-]{8,})/);
  return m ? m[1]! : null;
}
