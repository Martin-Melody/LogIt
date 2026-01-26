import { browser } from "$app/environment";
import type { WorkoutRepo } from "$lib/data/workoutRepo";

let repo: WorkoutRepo | null = null;
let didInit = false;

export async function initRepo(): Promise<void> {
  // Prevent SSR issues — repos may use localStorage / native plugins
  if (!browser) return;

  if (didInit) return;
  didInit = true;

  // NOTE: We will set the real implementation in feat/repo-localstorage
  // For now, this stays unimplemented to keep this branch clean.
}

export function setRepo(nextRepo: WorkoutRepo): void {
  repo = nextRepo;
}

export function getRepo(): WorkoutRepo {
  if (!repo) {
    throw new Error(
      "WorkoutRepo not initialized. Call initRepo() during app startup (appInit) before using getRepo().",
    );
  }
  return repo;
}
