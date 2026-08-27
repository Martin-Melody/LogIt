import type {
  CoachProgramAuthoringRepo,
  ListMyProgramsOptions,
  MyCoachProgram,
} from "../coachProgramRepo";
import type { CoachProgram } from "../../domain/CoachProgram";
import { coachProgramApi, type RemoteMyCoachProgram } from "../../api/coachProgramApi";

function parse(entry: RemoteMyCoachProgram): MyCoachProgram | null {
  if (entry.deletedAtMs || !entry.dataJson) return null;
  try {
    return {
      program: JSON.parse(entry.dataJson) as CoachProgram,
      recipientUserId: entry.recipientUserId,
    };
  } catch {
    return null;
  }
}

/** Coach-side authoring repo backed directly by the API. Used by the web dashboard, where
 * the coach is always online while building a program. (The read-only stance of the other
 * remote repos is about *client* data — a coach's own authored programs are theirs to
 * write.) */
export function createRemoteCoachProgramRepo(): CoachProgramAuthoringRepo {
  return {
    async listMyPrograms(options?: ListMyProgramsOptions): Promise<MyCoachProgram[]> {
      const rows = await coachProgramApi.listMine(options);
      return rows.map(parse).filter((p): p is MyCoachProgram => p !== null);
    },

    async getMyProgram(programId: string): Promise<MyCoachProgram | null> {
      const rows = await coachProgramApi.listMine();
      const row = rows.find((r) => r.programId === programId);
      return row ? parse(row) : null;
    },

    async saveProgram(program: CoachProgram, recipientUsername?: string): Promise<void> {
      await coachProgramApi.upsert({
        programId: program.id,
        dataJson: JSON.stringify(program),
        updatedAtMs: program.updatedAtMs,
        recipientUsername,
      });
    },

    async deleteProgram(programId: string): Promise<void> {
      await coachProgramApi.upsert({
        programId,
        dataJson: "",
        updatedAtMs: Date.now(),
        deletedAtMs: Date.now(),
      });
    },
  };
}
