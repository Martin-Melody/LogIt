import { parsePhasePack } from "@logit/core/plugins/phasePack";
import { pluginsApi, type HostedRegistryEntry, type ServedManifest } from "@logit/core/api/pluginsApi";
import { syncApi } from "@logit/core/api/syncApi";
import { apiClient } from "@logit/core/api/client";
import {
  installRow,
  parseInstallRow,
  readCommunitySetting,
  removedInstallRow,
  writeCommunitySetting,
  type PluginInstallSource,
  type SyncedInstallData,
  type SyncedInstallRow,
} from "@logit/core/plugins/pluginInstalls";
import { verifyIntegrity } from "@logit/core/plugins/integrity";
import { isCodeFamily, FAMILY_ENTRY } from "@logit/core/plugins/pluginInfo";
import { runInSandbox } from "@logit/core/plugins/sandbox";
import { extractEntryExport } from "@logit/core/plugins/sandboxProtocol";
import { updateOwnProfile } from "$lib/features/ownProfile";

/**
 * Plugins on the dashboard: the reviewed catalog from this server, the installed list (synced
 * with the phone through /sync/plugins), the community plugins switch (on the synced
 * profile), and running a plugin's code in the same sandbox the phone uses.
 */

export type Installed = SyncedInstallData & { row: SyncedInstallRow };

class PluginState {
  catalog = $state<HostedRegistryEntry[] | null>(null);
  catalogError = $state<string | null>(null);
  rows = $state<Map<string, SyncedInstallRow>>(new Map());
  installsLoaded = $state(false);
  community = $state<{ enabled: boolean; acknowledgedRisk: boolean; updatedAtMs: number } | null>(null);

  installed = $derived.by((): Installed[] => {
    const out: Installed[] = [];
    for (const row of this.rows.values()) {
      const data = parseInstallRow(row);
      if (data) out.push({ ...data, row });
    }
    return out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  });

  communityOn = $derived(this.community?.enabled === true);

  async loadCatalog(): Promise<void> {
    try {
      this.catalog = await pluginsApi.registry();
      this.catalogError = null;
    } catch (e) {
      this.catalogError = e instanceof Error ? e.message : "Couldn't load plugins";
      this.catalog ??= [];
    }
  }

  async loadInstalls(): Promise<void> {
    const [{ plugins }, profile] = await Promise.all([
      pluginsApi.pullInstalls(0),
      syncApi.pullProfile().then((r) => r.profile).catch(() => null),
    ]);
    this.rows = new Map(plugins.map((r) => [r.id, r]));
    this.community = readCommunitySetting(profile?.pluginSettingsJson) ?? { enabled: false, acknowledgedRisk: false, updatedAtMs: 0 };
    this.installsLoaded = true;
  }

  get(id: string): Installed | null {
    return this.installed.find((p) => p.manifest.id === id) ?? null;
  }

  private async put(row: SyncedInstallRow): Promise<void> {
    await pluginsApi.pushInstalls([row]);
    const next = new Map(this.rows);
    next.set(row.id, row);
    this.rows = next;
  }

  /** Install (or replace) a plugin on every device: the phone picks it up at its next sync. */
  async install(manifest: ServedManifest, source: PluginInstallSource): Promise<void> {
    // Download and check it here first, so a broken plugin never reaches the phone.
    if (manifest.distribution?.bundleUrl) await fetchSource(manifest);
    const existing = this.get(manifest.id);
    const now = Date.now();
    await this.put(
      installRow(
        {
          manifest: manifest as SyncedInstallData["manifest"],
          enabled: existing?.enabled ?? true,
          installedAtMs: existing?.installedAtMs ?? now,
          source,
        },
        Math.max(now, (existing?.row.updatedAtMs ?? 0) + 1),
      ),
    );
    // A starting phase brings its parts (canvas SP8): one install for the block, progression and
    // questions it lists. A part that's gone from the directory is skipped; the phase says so.
    if (manifest.family === "phase-pack") {
      const pack = parsePhasePack(JSON.parse(await fetchSource(manifest)), manifest.id);
      for (const id of pack.includes) {
        if (this.get(id)) continue;
        const part = await pluginsApi.listed(id).catch(() => null);
        if (part) await this.install(part.manifest, source);
      }
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const p = this.get(id);
    if (!p) return;
    const { row, ...data } = p;
    await this.put(installRow({ ...data, enabled }, Math.max(Date.now(), row.updatedAtMs + 1)));
  }

  async remove(id: string): Promise<void> {
    const p = this.get(id);
    if (!p) return;
    await this.put(removedInstallRow(id, p.row.createdAtMs, Math.max(Date.now(), p.row.updatedAtMs + 1)));
  }

  /** The community plugins switch, for your whole account. */
  async setCommunity(enabled: boolean): Promise<void> {
    const setting = { enabled, acknowledgedRisk: enabled || this.community?.acknowledgedRisk === true, updatedAtMs: Date.now() };
    const json = writeCommunitySetting(setting);
    const { profile } = await syncApi.pullProfile();
    if (profile && profile.updatedAtMs > 0) {
      // Merged per key on the server, so the rest of the profile isn't touched (no bump).
      await updateOwnProfile(() => ({ pluginSettingsJson: json }), { bump: false });
    } else {
      // No profile from a phone yet. Store one dated 0, so a phone never takes its (empty)
      // fields: its own profile wins the moment it syncs. The switch merges on its own time.
      const user = apiClient.getUser();
      await syncApi.pushProfile({
        displayName: user?.displayName ?? user?.username ?? "",
        bio: "",
        avatarDataUrl: null,
        progressPhotoDataUrl: null,
        height: null,
        heightUnit: "cm",
        weight: null,
        weightUnit: "kg",
        blocksCollapsedByDefault: false,
        restDefaultsJson: "{}",
        navConfigJson: null,
        homeConfigJson: null,
        activeSplitId: null,
        updatedAtMs: 0,
        pluginSettingsJson: json,
      });
    }
    this.community = setting;
  }
}

export const plugins = new PluginState();

// ── Code ──────────────────────────────────────────────────────────────────────

const sources = new Map<string, Promise<string>>();

/** Download a plugin's code (or pack data) and check it against the manifest's hash. */
export function fetchSource(manifest: Pick<ServedManifest, "id" | "integrity" | "distribution">): Promise<string> {
  const url = manifest.distribution?.bundleUrl;
  if (!url) return Promise.reject(new Error("This plugin has no code to download."));
  const key = `${url}#${manifest.integrity ?? ""}`;
  let job = sources.get(key);
  if (!job) {
    job = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn't download the plugin (${res.status}).`);
      const text = await res.text();
      if (manifest.integrity && !(await verifyIntegrity(text, manifest.integrity))) {
        throw new Error("The download doesn't match the plugin's hash, so it wasn't used.");
      }
      return text;
    })();
    job.catch(() => sources.delete(key));
    sources.set(key, job);
  }
  return job;
}

/** Run one method of a code plugin in the sandbox (fresh VM per call, 300 ms limit). */
export async function runPlugin(family: string, source: string, input: unknown): Promise<unknown> {
  if (!isCodeFamily(family)) throw new Error("Packs have no code to run.");
  const { entry, method } = FAMILY_ENTRY[family]!;
  return runInSandbox(source, extractEntryExport(source) ?? entry, { kind: "call", method, input });
}

export async function pluginMeta(family: string, source: string): Promise<Record<string, unknown> | null> {
  const { entry } = FAMILY_ENTRY[family] ?? { entry: "widget" };
  try {
    const meta = await runInSandbox(source, extractEntryExport(source) ?? entry, { kind: "meta" });
    return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
