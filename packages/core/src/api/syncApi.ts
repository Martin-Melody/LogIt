import { apiClient, type ApiFetcher } from "./client";

export type RemoteSession = {
  id: string;
  startedAtMs: number;
  /** When it last changed; the server keeps the newer copy (older servers ignore it). */
  updatedAtMs?: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteSplit = {
  id: string;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteExercise = {
  id: string;
  createdAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
  /** Pull only: "strength" | "cardio" | "mobility". */
  kind?: string | null;
  /** Pull only: a coach's "clients see it" switch. */
  shared?: boolean | null;
};

export type RemoteCheckinSubmission = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteProfile = {
  displayName: string;
  bio: string;
  avatarDataUrl: string | null;
  /** A single current progress photo, distinct from the identity avatar. Same storage
   * pattern (client-resized base64 data-URL) — see docs/architecture/
   * profile-progress-redesign.md, V1 is one photo, not a gallery/timeline. */
  progressPhotoDataUrl: string | null;
  height: number | null;
  heightUnit: "cm" | "in";
  weight: number | null;
  weightUnit: "kg" | "lbs";
  blocksCollapsedByDefault: boolean;
  restDefaultsJson: string;
  navConfigJson: string | null;
  /** Home screen widget layout (which widgets, enabled state, order). Same rationale as
   * navConfigJson — this was local-only (a single, un-namespaced localStorage key, not even
   * synced or per-profile-scoped) until this field existed at all. */
  homeConfigJson: string | null;
  /**
   * Which split the user has picked as "active". The server stores this whole DTO as one
   * replace-on-write blob (no per-field merge), so every push — even one only editing, say,
   * bio — must include the current value or it silently wipes it out for the next puller.
   * Always build this via syncService.ts's buildRemoteProfile(), never a one-off literal.
   */
  activeSplitId: string | null;
  updatedAtMs: number;
  /** Which split day was done last, per split: { [splitId]: { lastDayId, recordedAtMs } }.
   * Unlike the rest of this blob it's merged per split (newest wins), on the server and on
   * pull, so the next workout is the same day on every device. */
  splitRotationJson?: string | null;
  /** Goals and weekly-streak settings: { [goalId]: Goal, streak: {...} }. Merged per key
   * (newest `updatedAtMs` wins) on the server and on pull, like splitRotationJson. */
  goalsJson?: string | null;
  /** Social profile cards (which show, in what order): { slots: [{ id, enabled, orderIndex }] }.
   * Edited on the phone or the dashboard; replaced with the rest of the profile. */
  profileConfigJson?: string | null;
  /** Plugin settings: { community: { enabled, acknowledgedRisk, updatedAtMs } } (see
   * plugins/pluginInstalls.ts). Merged per key (newest wins) like goalsJson. */
  pluginSettingsJson?: string | null;
  /** The goal picked in onboarding (domain/starterPlan.ts TrainingGoal). The dashboard
   * arranges Overview by it until someone changes the layout. Kept by the server when left out. */
  trainingGoal?: string | null;
  /** What you bring (domain/kit.ts BringItem[] as JSON). Kept by the server when left out. */
  kitJson?: string | null;
  /** Experience from the LogIt setup ("new", "under2", "2plus", "compete"), so a coach sees it. */
  experience?: string | null;
};

// ── Nutrition ────────────────────────────────────────────────────────────────
// All client-owned, last-write-wins by updatedAtMs, tombstoned via deletedAtMs — the same
// shape as RemoteCheckinSubmission. The goal is a singleton blob like RemoteProfile.

/** A place you train (domain/place.ts), one client-owned row like a habit. */
export type RemotePlace = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteNutritionDay = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteCustomFood = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteRecipe = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteFavoriteFood = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteMealTemplate = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

/** How one exercise progresses (ExerciseProgressionSettings as JSON); id = exercise key. */
export type RemoteExerciseSetting = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteWeightEntry = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteNutritionGoal = {
  dataJson: string;
  updatedAtMs: number;
};

// ── Habits ───────────────────────────────────────────────────────────────────
// Personal habits + their per-day check-offs. Client-owned, last-write-wins by
// updatedAtMs, tombstoned via deletedAtMs — same shape as the nutrition rows.

export type RemoteHabit = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

export type RemoteHabitEntry = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
};

/** The same calls as `syncApi`, made with another identity (a sandbox sample client's token). */
export function syncApiFor(api: ApiFetcher) {
  return {
    pushSessions(sessions: RemoteSession[]): Promise<void> {
      return api.fetch("/sync/sessions", {
        method: "POST",
        body: JSON.stringify({ sessions }),
      });
    },

    pullSessions(since: number, clientId?: string): Promise<{ sessions: RemoteSession[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/sessions?since=${since}${suffix}`);
    },

    pushSplits(splits: RemoteSplit[]): Promise<void> {
      return api.fetch("/sync/splits", {
        method: "POST",
        body: JSON.stringify({ splits }),
      });
    },

    pullSplits(since: number, clientId?: string): Promise<{ splits: RemoteSplit[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/splits?since=${since}${suffix}`);
    },

    pushExercises(exercises: RemoteExercise[]): Promise<void> {
      return api.fetch("/sync/exercises", {
        method: "POST",
        body: JSON.stringify({ exercises }),
      });
    },

    /** Strength exercises only (what app versions before the library expect). */
    pullExercises(since: number, clientId?: string): Promise<{ exercises: RemoteExercise[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/exercises?since=${since}${suffix}`);
    },

    /** Every library item of yours (or a client's): strength, cardio and mobility. */
    pullLibrary(since: number, clientId?: string): Promise<{ exercises: RemoteExercise[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/exercises?since=${since}&kinds=all${suffix}`);
    },

    pushProfile(profile: RemoteProfile): Promise<void> {
      return api.fetch("/sync/profile", {
        method: "POST",
        body: JSON.stringify(profile),
      });
    },

    pushCheckinSubmissions(submissions: RemoteCheckinSubmission[]): Promise<void> {
      return api.fetch("/sync/checkins", {
        method: "POST",
        body: JSON.stringify({ submissions }),
      });
    },

    pullCheckinSubmissions(
      since: number,
      clientId?: string,
    ): Promise<{ submissions: RemoteCheckinSubmission[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/checkins?since=${since}${suffix}`);
    },

    pullProfile(clientId?: string): Promise<{ profile: RemoteProfile | null }> {
      const suffix = clientId ? `?clientId=${clientId}` : "";
      return api.fetch(`/sync/profile${suffix}`);
    },

    // ── Nutrition ──────────────────────────────────────────────────────────────

    pushNutritionDays(days: RemoteNutritionDay[]): Promise<void> {
      return api.fetch("/sync/nutrition/days", {
        method: "POST",
        body: JSON.stringify({ days }),
      });
    },

    pullNutritionDays(
      since: number,
      clientId?: string,
    ): Promise<{ days: RemoteNutritionDay[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/nutrition/days?since=${since}${suffix}`);
    },

    pushCustomFoods(foods: RemoteCustomFood[]): Promise<void> {
      return api.fetch("/sync/nutrition/custom-foods", {
        method: "POST",
        body: JSON.stringify({ foods }),
      });
    },

    pullCustomFoods(since: number): Promise<{ foods: RemoteCustomFood[] }> {
      return api.fetch(`/sync/nutrition/custom-foods?since=${since}`);
    },

    pushRecipes(recipes: RemoteRecipe[]): Promise<void> {
      return api.fetch("/sync/nutrition/recipes", {
        method: "POST",
        body: JSON.stringify({ recipes }),
      });
    },

    pullRecipes(since: number): Promise<{ recipes: RemoteRecipe[] }> {
      return api.fetch(`/sync/nutrition/recipes?since=${since}`);
    },

    pushFavorites(favorites: RemoteFavoriteFood[]): Promise<void> {
      return api.fetch("/sync/nutrition/favorites", {
        method: "POST",
        body: JSON.stringify({ favorites }),
      });
    },

    pullFavorites(since: number): Promise<{ favorites: RemoteFavoriteFood[] }> {
      return api.fetch(`/sync/nutrition/favorites?since=${since}`);
    },

    pushMealTemplates(templates: RemoteMealTemplate[]): Promise<void> {
      return api.fetch("/sync/nutrition/meal-templates", {
        method: "POST",
        body: JSON.stringify({ templates }),
      });
    },

    pullMealTemplates(since: number): Promise<{ templates: RemoteMealTemplate[] }> {
      return api.fetch(`/sync/nutrition/meal-templates?since=${since}`);
    },

    pushExerciseSettings(settings: RemoteExerciseSetting[]): Promise<void> {
      return api.fetch("/sync/exercise-settings", { method: "POST", body: JSON.stringify({ settings }) });
    },

    pullExerciseSettings(since: number): Promise<{ settings: RemoteExerciseSetting[] }> {
      return api.fetch(`/sync/exercise-settings?since=${since}`);
    },

    pushProgressionRecipes(recipes: RemoteExerciseSetting[]): Promise<void> {
      return api.fetch("/sync/progression-recipes", { method: "POST", body: JSON.stringify({ recipes }) });
    },

    pullProgressionRecipes(since: number): Promise<{ recipes: RemoteExerciseSetting[] }> {
      return api.fetch(`/sync/progression-recipes?since=${since}`);
    },

    pushWeightEntries(entries: RemoteWeightEntry[]): Promise<void> {
      return api.fetch("/sync/nutrition/weight", {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
    },

    pullWeightEntries(
      since: number,
      clientId?: string,
    ): Promise<{ entries: RemoteWeightEntry[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/nutrition/weight?since=${since}${suffix}`);
    },

    pushNutritionGoal(goal: RemoteNutritionGoal): Promise<void> {
      return api.fetch("/sync/nutrition/goal", {
        method: "POST",
        body: JSON.stringify(goal),
      });
    },

    pullNutritionGoal(clientId?: string): Promise<{ goal: RemoteNutritionGoal | null }> {
      const suffix = clientId ? `?clientId=${clientId}` : "";
      return api.fetch(`/sync/nutrition/goal${suffix}`);
    },

    // ── Places (My gym) ────────────────────────────────────────────────────────

    pushPlaces(places: RemotePlace[]): Promise<void> {
      return api.fetch("/sync/places", { method: "POST", body: JSON.stringify({ places }) });
    },

    pullPlaces(since: number, clientId?: string): Promise<{ places: RemotePlace[] }> {
      if (clientId) return api.fetch(`/sync/places?since=${since}&clientId=${encodeURIComponent(clientId)}`);
      return api.fetch(`/sync/places?since=${since}`);
    },

    // ── Habits ─────────────────────────────────────────────────────────────────

    pushHabits(habits: RemoteHabit[]): Promise<void> {
      return api.fetch("/sync/habits", {
        method: "POST",
        body: JSON.stringify({ habits }),
      });
    },

    pullHabits(since: number, clientId?: string): Promise<{ habits: RemoteHabit[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/habits?since=${since}${suffix}`);
    },

    pushHabitEntries(entries: RemoteHabitEntry[]): Promise<void> {
      return api.fetch("/sync/habit-entries", {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
    },

    pullHabitEntries(
      since: number,
      clientId?: string,
    ): Promise<{ entries: RemoteHabitEntry[] }> {
      const suffix = clientId ? `&clientId=${clientId}` : "";
      return api.fetch(`/sync/habit-entries?since=${since}${suffix}`);
    },
  };
}

export const syncApi = syncApiFor(apiClient);
