import { writable } from "svelte/store";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";
import { getCoachProgramRepo } from "$lib/data/repoProvider";

type AssignedProgramsStore = {
  subscribe: (run: (value: CoachProgram[]) => void) => () => void;
  refresh: () => Promise<CoachProgram[]>;
  clear: () => void;
};

function createAssignedProgramsStore(): AssignedProgramsStore {
  const store = writable<CoachProgram[]>([]);
  let token = 0;

  return {
    subscribe: store.subscribe,

    async refresh() {
      const t = ++token;
      let list: CoachProgram[] = [];
      try {
        list = await getCoachProgramRepo().listAssignedPrograms();
      } catch {
        list = [];
      }
      if (t === token) store.set(list);
      return list;
    },

    clear() {
      store.set([]);
    },
  };
}

export const assignedPrograms = createAssignedProgramsStore();
