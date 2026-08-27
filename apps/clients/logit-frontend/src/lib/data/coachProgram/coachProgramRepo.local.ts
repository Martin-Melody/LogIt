import { browser } from "$app/environment";
import type { AssignedProgramRepo } from "@logit/core/data/coachProgramRepo";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";

const KEYS = {
  programs: "logit:coachPrograms:v1", // Record<id, CoachProgram>
  activeId: "logit:activeCoachProgramId:v1",
} as const;

function readAll(): Record<string, CoachProgram> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(KEYS.programs) ?? "{}") as Record<string, CoachProgram>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, CoachProgram>): void {
  if (!browser) return;
  localStorage.setItem(KEYS.programs, JSON.stringify(map));
}

/** Web (localStorage) mirror of coach-assigned programs. Same read-only contract as the
 * SQLite variant. */
export function createLocalCoachProgramRepo(): AssignedProgramRepo {
  return {
    async listAssignedPrograms(): Promise<CoachProgram[]> {
      return Object.values(readAll())
        .filter((p) => !p.archived)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    },

    async getAssignedProgram(id: string): Promise<CoachProgram | null> {
      return readAll()[id] ?? null;
    },

    async getActiveProgramId(): Promise<string | null> {
      if (!browser) return null;
      const v = (localStorage.getItem(KEYS.activeId) ?? "").trim();
      return v ? v : null;
    },

    async setActiveProgramId(id: string | null): Promise<void> {
      if (!browser) return;
      if (id) localStorage.setItem(KEYS.activeId, id);
      else localStorage.removeItem(KEYS.activeId);
    },

    async upsertFromRemote(program: CoachProgram): Promise<void> {
      const map = readAll();
      map[program.id] = program;
      writeAll(map);
    },

    async removeFromRemote(id: string): Promise<void> {
      const map = readAll();
      delete map[id];
      writeAll(map);
      if ((await this.getActiveProgramId()) === id) await this.setActiveProgramId(null);
    },
  };
}
