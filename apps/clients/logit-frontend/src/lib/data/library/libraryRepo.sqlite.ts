import type { CoachLibraryItem, LibraryRepo, OwnLibraryItem } from "@logit/core/data/libraryRepo";
import { libraryItemFromJson, libraryItemToJson } from "@logit/core/domain/library";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

function own(r: { kind: string; data_json: string }): OwnLibraryItem | null {
  const parsed = libraryItemFromJson(r.data_json, r.kind);
  return parsed && parsed.kind !== "strength" ? parsed : null;
}

export function createSqliteLibraryRepo(): LibraryRepo {
  return {
    async listOwn(kind) {
      const owner = getActiveOwnerId();
      const res = await getDb().query(
        `SELECT kind, data_json FROM library_items WHERE owner_id IS ? ${kind ? "AND kind = ?" : ""} ORDER BY name COLLATE NOCASE`,
        kind ? [owner, kind] : [owner],
      );
      return (res.values ?? []).map(own).filter((x): x is OwnLibraryItem => x != null);
    },

    async getOwn(id) {
      const res = await getDb().query(
        `SELECT kind, data_json FROM library_items WHERE id = ? AND owner_id IS ?`,
        [id, getActiveOwnerId()],
      );
      const r = res.values?.[0];
      return r ? own(r) : null;
    },

    async saveOwn(entry) {
      await getDb().run(
        `INSERT INTO library_items(id, owner_id, kind, name, data_json, updated_at_ms) VALUES(?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name, data_json=excluded.data_json, updated_at_ms=excluded.updated_at_ms`,
        [entry.item.id, getActiveOwnerId(), entry.kind, entry.item.name, libraryItemToJson(entry), entry.item.updatedAtMs ?? nowMs()],
      );
    },

    async removeOwn(id) {
      await getDb().run(`DELETE FROM library_items WHERE id = ? AND owner_id IS ?`, [id, getActiveOwnerId()]);
    },

    async listFromCoaches() {
      const res = await getDb().query(
        `SELECT id, coach_id, coach_name, kind, data_json, via_program FROM coach_library_items WHERE owner_id = ?`,
        [getActiveOwnerId() ?? ""],
      );
      const out: CoachLibraryItem[] = [];
      for (const r of res.values ?? []) {
        const parsed = libraryItemFromJson(r.data_json, r.kind);
        if (!parsed) continue;
        out.push({ ...parsed, coach: { coachId: r.coach_id, coachName: r.coach_name }, viaProgram: r.via_program === 1 } as CoachLibraryItem);
      }
      return out;
    },

    async replaceFromCoaches(items) {
      const db = getDb();
      const owner = getActiveOwnerId() ?? "";
      await db.run(`DELETE FROM coach_library_items WHERE owner_id = ?`, [owner]);
      for (const i of items) {
        await db.run(
          `INSERT OR REPLACE INTO coach_library_items(owner_id, id, coach_id, coach_name, kind, data_json, via_program) VALUES(?,?,?,?,?,?,?)`,
          [owner, i.item.id, i.coach.coachId, i.coach.coachName, i.kind, libraryItemToJson(i), i.viaProgram ? 1 : 0],
        );
      }
    },
  };
}
