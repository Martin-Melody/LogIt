import type { CoachProgram } from "../domain/CoachProgram";

/** Read-only view of the programs a coach has assigned to the current user. Backed on the
 * client by a local mirror table that the sync loop keeps up to date (see
 * pullAndMergeCoachPrograms in the mobile syncService). The user never edits these — they
 * stay live-linked to the coach's copy. */
export interface AssignedProgramRepo {
  listAssignedPrograms(): Promise<CoachProgram[]>;
  getAssignedProgram(id: string): Promise<CoachProgram | null>;

  /** Which assigned program the user is currently following, if any. Mirrors the
   * activeSplitId concept for own splits — a separate pointer so the two lists don't
   * collide. */
  getActiveProgramId(): Promise<string | null>;
  setActiveProgramId(id: string | null): Promise<void>;

  // ── Sync-merge surface (called only by the sync loop, not the UI) ──
  upsertFromRemote(program: CoachProgram): Promise<void>;
  removeFromRemote(id: string): Promise<void>;
}

export interface ListMyProgramsOptions {
  /** Filter to programs assigned to one client (server user id). */
  recipientId?: string;
  /** Only unassigned templates. */
  templates?: boolean;
}

/** Coach-side authoring of programs. Implemented remotely for the web dashboard
 * (remoteCoachProgramRepo) and locally + outbox on mobile. */
export interface CoachProgramAuthoringRepo {
  listMyPrograms(options?: ListMyProgramsOptions): Promise<MyCoachProgram[]>;
  getMyProgram(programId: string): Promise<MyCoachProgram | null>;
  /** Persist a program. `recipientUsername` assigns/reassigns it; omit to leave the
   * existing assignment (or keep it a template). */
  saveProgram(program: CoachProgram, recipientUsername?: string): Promise<void>;
  deleteProgram(programId: string): Promise<void>;
}

export type MyCoachProgram = {
  program: CoachProgram;
  /** Server user id of the assigned client, or null for a template. */
  recipientUserId: string | null;
};
