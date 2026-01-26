import { browser } from "$app/environment";
import type { WorkoutRepo } from "$lib/data/workoutRepo";
import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { isNativePlatform } from "$lib/platform/isNative";

let repo: WorkoutRepo | null = null;
let didInit = false;

export async function initRepo(): Promise<void> {
  if (!browser) return;
  if (didInit) return;
  didInit = true;

  // For MVP: always use localStorage (works on web + Capacitor WebView).
  // Later: if (isNativePlatform()) use SQLite repo instead.
  // Keeping the platform check here shows where the switch will live.
  void isNativePlatform();

  repo = createLocalWorkoutRepo();
}

export function getRepo(): WorkoutRepo {
  if (!repo) {
    throw new Error(
      "WorkoutRepo not initialized. Call initRepo() during app startup (appInit) before using getRepo().",
    );
  }
  return repo;
}
