/**
 * The installed-plugins list that syncs between the phone and the dashboard. One row per plugin
 * (keyed by manifest id), last write wins by `updatedAtMs`, removals are tombstones — the same
 * rules as habits. The row carries the manifest; each device downloads and hash-checks the
 * code itself.
 *
 * Also the community plugins switch, which rides on the synced profile as
 * `pluginSettingsJson = { community: { enabled, acknowledgedRisk, updatedAtMs } }`.
 */

export type PluginInstallSource = "registry" | "link" | "draft" | "file";

export type SyncedInstallData = {
  /** The manifest as installed (with distribution + integrity). Typed loosely: core doesn't own the app's manifest type. */
  manifest: { id: string; family: string; name: string; version: string; integrity?: string } & Record<string, unknown>;
  enabled: boolean;
  installedAtMs: number;
  source: PluginInstallSource;
};

export type SyncedInstallRow = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export function parseInstallRow(row: SyncedInstallRow): SyncedInstallData | null {
  if (row.deletedAtMs || !row.dataJson) return null;
  try {
    const data = JSON.parse(row.dataJson) as Partial<SyncedInstallData>;
    const m = data.manifest;
    if (!m || typeof m !== "object" || typeof m.id !== "string" || m.id !== row.id) return null;
    if (typeof m.family !== "string" || typeof m.name !== "string") return null;
    return {
      manifest: m as SyncedInstallData["manifest"],
      enabled: data.enabled !== false,
      installedAtMs: typeof data.installedAtMs === "number" ? data.installedAtMs : row.createdAtMs,
      source: (["registry", "link", "draft", "file"] as const).includes(data.source as PluginInstallSource)
        ? (data.source as PluginInstallSource)
        : "registry",
    };
  } catch {
    return null;
  }
}

export function installRow(data: SyncedInstallData, updatedAtMs: number): SyncedInstallRow {
  return {
    id: data.manifest.id,
    createdAtMs: data.installedAtMs,
    updatedAtMs,
    dataJson: JSON.stringify(data),
    deletedAtMs: null,
  };
}

export function removedInstallRow(id: string, createdAtMs: number, nowMs: number): SyncedInstallRow {
  return { id, createdAtMs, updatedAtMs: nowMs, dataJson: null, deletedAtMs: nowMs };
}

/**
 * Merge pulled rows into the local rows: per id, the newer `updatedAtMs` wins (ties keep the
 * local one, so a local change isn't undone by its own echo). Returns the merged map and
 * which ids changed locally.
 */
export function mergeInstallRows(
  local: ReadonlyMap<string, SyncedInstallRow>,
  remote: readonly SyncedInstallRow[],
): { rows: Map<string, SyncedInstallRow>; changed: string[] } {
  const rows = new Map(local);
  const changed: string[] = [];
  for (const r of remote) {
    const mine = rows.get(r.id);
    if (!mine || r.updatedAtMs > mine.updatedAtMs) {
      rows.set(r.id, r);
      changed.push(r.id);
    }
  }
  return { rows, changed };
}

export type CommunitySetting = { enabled: boolean; acknowledgedRisk: boolean; updatedAtMs: number };

export function readCommunitySetting(pluginSettingsJson: string | null | undefined): CommunitySetting | null {
  if (!pluginSettingsJson) return null;
  try {
    const c = (JSON.parse(pluginSettingsJson) as { community?: Partial<CommunitySetting> }).community;
    if (!c || typeof c.updatedAtMs !== "number") return null;
    return { enabled: c.enabled === true, acknowledgedRisk: c.acknowledgedRisk === true, updatedAtMs: c.updatedAtMs };
  } catch {
    return null;
  }
}

export function writeCommunitySetting(setting: CommunitySetting): string {
  return JSON.stringify({ community: setting });
}
