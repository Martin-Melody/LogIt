import { apiClient } from "./client";

/** An item a coach shares with this account (or that's in a program they assigned). */
export type SharedLibraryItem = {
  coachId: string;
  coachName: string;
  id: string;
  kind: string;
  dataJson: string;
  viaProgram: boolean;
  updatedAtMs: number;
};

export const libraryApi = {
  /** Coach (Studio): turn "clients see it" on or off for some of your own items. */
  setSharing(ids: string[], shared: boolean): Promise<{ changed: number }> {
    return apiClient.fetch("/coach/library/sharing", {
      method: "PUT",
      body: JSON.stringify({ ids, shared }),
    });
  },

  /** Everything your coaches share with you. The whole list every time (it's small). */
  getShared(): Promise<{ items: SharedLibraryItem[] }> {
    return apiClient.fetch("/coach/library/shared");
  },
};
