import type { CardioActivity } from "../domain/cardioActivity";
import type { MobilityDrill } from "../domain/mobilityDrill";
import type { CoachRef, LibraryItem } from "../domain/library";

/** Your own cardio activity or mobility drill. (Your own strength exercises live in ExerciseRepo.) */
export type OwnLibraryItem =
  | { kind: "cardio"; item: CardioActivity }
  | { kind: "mobility"; item: MobilityDrill };

/** An item a coach shares with you, as last fetched. Read-only. */
export type CoachLibraryItem = LibraryItem & {
  coach: CoachRef;
  /** In a program the coach assigned you, so it's there whether shared or not. */
  viaProgram: boolean;
};

export interface LibraryRepo {
  listOwn(kind?: OwnLibraryItem["kind"]): Promise<OwnLibraryItem[]>;
  getOwn(id: string): Promise<OwnLibraryItem | null>;
  /** Insert or replace. */
  saveOwn(entry: OwnLibraryItem): Promise<void>;
  removeOwn(id: string): Promise<void>;

  listFromCoaches(): Promise<CoachLibraryItem[]>;
  /** Swap in the latest list from the server (it's always sent whole). */
  replaceFromCoaches(items: CoachLibraryItem[]): Promise<void>;
}
