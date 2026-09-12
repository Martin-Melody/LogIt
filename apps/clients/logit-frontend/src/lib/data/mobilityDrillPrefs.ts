import { browser } from "$app/environment";
import { isNativePlatform } from "$lib/platform/isNative";
import { mobilityDrillSlug } from "@logit/core/domain/mobilityDrill";
import type { MobilitySide } from "@logit/core/domain/workout";

/**
 * Durable per-drill preferences set from a mobility drill's detail sheet — a
 * default for *that one drill* that beats the app-wide Settings default (but
 * is still overridable per set from the edit-set sheet). Native persists to
 * SQLite (owner-scoped, so it doesn't bleed across local accounts); web keeps
 * one flat localStorage map, matching how the rest of the app's web-only
 * state works (no multi-account concept there).
 */

const STORAGE_KEY = "logit:mobilityDrillPrefs:v1";

export function mobilityDrillKey(drillId: string | undefined, name: string): string {
  return drillId || mobilityDrillSlug(name);
}

function readWebMap(): Record<string, MobilitySide> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export async function getMobilityDrillLeadSide(drillKey: string): Promise<MobilitySide | undefined> {
  if (isNativePlatform()) {
    const { getDb } = await import("$lib/data/db/sqlite");
    const { getActiveOwnerId } = await import("$lib/data/activeOwner");
    const ownerId = getActiveOwnerId();
    if (!ownerId) return undefined;
    const res = await getDb().query(
      `SELECT lead_side FROM mobility_drill_prefs WHERE owner_id = ? AND drill_key = ?`,
      [ownerId, drillKey],
    );
    const row = (res.values ?? [])[0] as { lead_side?: string } | undefined;
    return row?.lead_side === "left" || row?.lead_side === "right" ? row.lead_side : undefined;
  }
  const v = readWebMap()[drillKey];
  return v === "left" || v === "right" ? v : undefined;
}

export async function setMobilityDrillLeadSide(
  drillKey: string,
  leadSide: MobilitySide | undefined,
): Promise<void> {
  if (isNativePlatform()) {
    const { getDb } = await import("$lib/data/db/sqlite");
    const { getActiveOwnerId } = await import("$lib/data/activeOwner");
    const ownerId = getActiveOwnerId();
    if (!ownerId) return;
    const db = getDb();
    if (leadSide) {
      await db.run(
        `INSERT INTO mobility_drill_prefs(owner_id, drill_key, lead_side) VALUES(?,?,?)
         ON CONFLICT(owner_id, drill_key) DO UPDATE SET lead_side = excluded.lead_side`,
        [ownerId, drillKey, leadSide],
      );
    } else {
      await db.run(`DELETE FROM mobility_drill_prefs WHERE owner_id = ? AND drill_key = ?`, [ownerId, drillKey]);
    }
    return;
  }
  if (!browser) return;
  const map = readWebMap();
  if (leadSide) map[drillKey] = leadSide;
  else delete map[drillKey];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
