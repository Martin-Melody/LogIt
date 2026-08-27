import { browser } from "$app/environment";
import type { ListMyProgramsOptions, MyCoachProgram } from "@logit/core/data/coachProgramRepo";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";
import type { AuthoredProgramRepo } from "./authoredProgramRepo.sqlite";

const KEY = "logit:authoredPrograms:v1"; // Record<id, Entry>

type Entry = {
  program: CoachProgram;
  recipientUsername: string | null;
  deletedAtMs: number | null;
};

function readAll(): Record<string, Entry> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, Entry>): void {
  if (!browser) return;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function createLocalAuthoredProgramRepo(): AuthoredProgramRepo {
  return {
    async listMyPrograms(options?: ListMyProgramsOptions): Promise<MyCoachProgram[]> {
      return Object.values(readAll())
        .filter((e) => !e.deletedAtMs)
        .filter((e) => {
          if (options?.templates) return e.recipientUsername === null;
          return true;
        })
        .sort((a, b) => b.program.updatedAtMs - a.program.updatedAtMs)
        .map((e) => ({ program: e.program, recipientUserId: null }));
    },

    async listForRecipient(username: string): Promise<CoachProgram[]> {
      return Object.values(readAll())
        .filter((e) => !e.deletedAtMs && e.recipientUsername === username)
        .sort((a, b) => b.program.updatedAtMs - a.program.updatedAtMs)
        .map((e) => e.program);
    },

    async getMyProgram(programId: string): Promise<MyCoachProgram | null> {
      const e = readAll()[programId];
      return e && !e.deletedAtMs ? { program: e.program, recipientUserId: null } : null;
    },

    async recipientUsernameOf(programId: string): Promise<string | null> {
      return readAll()[programId]?.recipientUsername ?? null;
    },

    async saveProgram(program: CoachProgram, recipientUsername?: string): Promise<void> {
      const map = readAll();
      const prev = map[program.id];
      map[program.id] = {
        program,
        recipientUsername: recipientUsername ?? prev?.recipientUsername ?? null,
        deletedAtMs: null,
      };
      writeAll(map);
    },

    async deleteProgram(programId: string): Promise<void> {
      const map = readAll();
      const e = map[programId];
      if (e) {
        e.deletedAtMs = Date.now();
        e.program.updatedAtMs = Date.now();
        writeAll(map);
      }
    },

    async listForPush() {
      return Object.values(readAll())
        .filter((e) => !e.deletedAtMs)
        .map((e) => ({ program: e.program, recipientUsername: e.recipientUsername }));
    },
  };
}
