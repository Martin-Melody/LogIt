import { browser } from "$app/environment";
import type { MessagesRepo } from "./messagesRepo";
import type { CoachMessage } from "@logit/core/domain/CoachMessage";

const KEY = "logit:coachMessages:v1"; // Record<id, CoachMessage>

function readAll(): Record<string, CoachMessage> {
  if (!browser) return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, CoachMessage>; } catch { return {}; }
}
function writeAll(m: Record<string, CoachMessage>): void {
  if (browser) localStorage.setItem(KEY, JSON.stringify(m));
}

export function createLocalMessagesRepo(): MessagesRepo {
  return {
    async listThread(relationshipId: string): Promise<CoachMessage[]> {
      return Object.values(readAll())
        .filter((m) => m.relationshipId === relationshipId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },
    async addOutgoing(m: CoachMessage): Promise<void> {
      const map = readAll();
      if (!map[m.id]) { map[m.id] = { ...m, mine: true, synced: false }; writeAll(map); }
    },
    async markSynced(id: string): Promise<void> {
      const map = readAll();
      if (map[id]) { map[id].synced = true; writeAll(map); }
    },
    async upsertFromRemote(m: CoachMessage): Promise<void> {
      const map = readAll();
      map[m.id] = { ...m, synced: true };
      writeAll(map);
    },
    async pendingOutgoing(): Promise<CoachMessage[]> {
      return Object.values(readAll())
        .filter((m) => m.mine && !m.synced)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },
    async markThreadRead(relationshipId: string, upToMs: number): Promise<void> {
      const map = readAll();
      let changed = false;
      for (const m of Object.values(map)) {
        if (m.relationshipId === relationshipId && !m.mine && m.readAtMs == null && m.createdAtMs <= upToMs) {
          m.readAtMs = Date.now();
          changed = true;
        }
      }
      if (changed) writeAll(map);
    },
    async unreadCount(relationshipId?: string): Promise<number> {
      return Object.values(readAll()).filter(
        (m) => !m.mine && m.readAtMs == null && (!relationshipId || m.relationshipId === relationshipId),
      ).length;
    },
    async listCommentsForDate(dateIso: string): Promise<CoachMessage[]> {
      return Object.values(readAll())
        .filter((m) => m.contextDateIso === dateIso)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },
  };
}
