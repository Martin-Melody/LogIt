import { apiClient } from "@logit/core/api/client";
import { pluginsApi } from "@logit/core/api/pluginsApi";
import { log } from "@logit/core/platform/log";
import {
  installRow,
  parseInstallRow,
  removedInstallRow,
  type SyncedInstallRow,
} from "@logit/core/plugins/pluginInstalls";
import { enqueue } from "$lib/sync/outbox";
import { syncStorageKey } from "$lib/sync/syncKeys";
import {
  getInstalledPlugin,
  listInstalledPluginManifests,
  onInstalledPluginChange,
  setPluginEnabled,
  uninstallPlugin,
} from "./catalog";
import { installPluginFromManifest } from "./installer";
import { isPluginManifest } from "./discovery";
import type { InstalledPlugin, PluginManifest } from "./types";

/**
 * Installed plugins sync between your devices (and the dashboard): one row per plugin, newest
 * change wins, removals are tombstones (core plugins/pluginInstalls.ts). A row carries the
 * manifest; this device downloads and hash-checks the code itself before it counts as
 * installed here.
 *
 * Only plugins another device could install travel: ones with a download link, and
 * self-contained packs. A plugin pasted in without a link stays on this device.
 */

const LAST_PULLED_KEY = "logit:sync:pluginInstallsLastPulledAt";

function canTravel(m: PluginManifest): boolean {
  const d = m.distribution;
  if (d.origin === "inline") return true;
  return (d.origin === "url" || d.origin === "manual" || d.origin === "activitypub") && !!d.bundleUrl && /^https?:\/\//.test(d.bundleUrl);
}

export function rowFor(p: InstalledPlugin): SyncedInstallRow {
  return installRow(
    {
      manifest: p.manifest as unknown as Parameters<typeof installRow>[0]["manifest"],
      enabled: p.enabled,
      installedAtMs: p.installedAtMs,
      source: p.source ?? "registry",
    },
    p.updatedAtMs ?? p.installedAtMs,
  );
}

function push(row: SyncedInstallRow): void {
  if (!apiClient.isAuthenticated()) return;
  pluginsApi.pushInstalls([row]).catch(() => enqueue({ type: "pluginInstall", dto: row }));
}

onInstalledPluginChange((change) => {
  if (change.kind === "saved") {
    if (canTravel(change.plugin.manifest)) push(rowFor(change.plugin));
  } else {
    push(removedInstallRow(change.id, change.createdAtMs, change.updatedAtMs));
  }
});

/** Push every installed plugin — when sync newly becomes available on this device. */
export async function pushAllPluginInstalls(): Promise<void> {
  if (!apiClient.isAuthenticated()) return;
  try {
    const rows = (await listInstalledPluginManifests()).filter((p) => canTravel(p.manifest)).map(rowFor);
    if (rows.length) await pluginsApi.pushInstalls(rows);
  } catch (e) {
    log.warn("sync", "pushAllPluginInstalls failed", e);
  }
}

function sameCode(a: PluginManifest, b: PluginManifest): boolean {
  const url = (m: PluginManifest) => ("bundleUrl" in m.distribution ? m.distribution.bundleUrl : undefined);
  return a.version === b.version && a.integrity === b.integrity && url(a) === url(b);
}

/** Apply installs, switches and removals made on your other devices. */
export async function pullAndMergePluginInstalls(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  const key = syncStorageKey(LAST_PULLED_KEY);
  let ok = true;
  // A plugin that won't download (offline mid-sync, a removed draft) keeps the cursor where
  // it was, so it's tried again next sync; it doesn't mark the whole sync as failed.
  let retry = false;
  try {
    const since = Number(localStorage.getItem(key) ?? 0) || 0;
    const startedAt = Date.now();
    const { plugins } = await pluginsApi.pullInstalls(since);
    for (const row of plugins) {
      try {
        const local = await getInstalledPlugin(row.id);
        if (local && (local.updatedAtMs ?? local.installedAtMs) >= row.updatedAtMs) continue;

        const data = parseInstallRow(row);
        if (!data) {
          if (local) await uninstallPlugin(row.id, { fromSync: true });
          continue;
        }
        const manifest = data.manifest as unknown as PluginManifest;
        if (!isPluginManifest(manifest)) continue;

        if (local && sameCode(local.manifest, manifest)) {
          await setPluginEnabled(row.id, data.enabled, { fromSync: true, updatedAtMs: row.updatedAtMs });
        } else {
          // New here, or a new version: download and check it before it counts as installed.
          await installPluginFromManifest(manifest, data.enabled, {
            fromSync: true,
            updatedAtMs: row.updatedAtMs,
            source: data.source,
          });
        }
      } catch (e) {
        // One plugin that won't download doesn't stop the rest; it's tried again next sync.
        log.warn("sync", `Couldn't apply plugin ${row.id} from another device`, e);
        retry = true;
      }
    }
    if (!retry) localStorage.setItem(key, String(startedAt));
  } catch (e) {
    log.warn("sync", "pullAndMergePluginInstalls failed", e);
    ok = false;
  }
  return ok;
}
