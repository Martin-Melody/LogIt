import { apiClient } from "./client";

export type RemoteSession = {
  id: string;
  startedAtMs: number;
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
  height: number | null;
  heightUnit: "cm" | "in";
  weight: number | null;
  weightUnit: "kg" | "lbs";
  blocksCollapsedByDefault: boolean;
  restDefaultsJson: string;
  navConfigJson: string | null;
  updatedAtMs: number;
};

// ── Nutrition ────────────────────────────────────────────────────────────────
// All client-owned, last-write-wins by updatedAtMs, tombstoned via deletedAtMs — the same
// shape as RemoteCheckinSubmission. The goal is a singleton blob like RemoteProfile.

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

export const syncApi = {
  pushSessions(sessions: RemoteSession[]): Promise<void> {
    return apiClient.fetch("/sync/sessions", {
      method: "POST",
      body: JSON.stringify({ sessions }),
    });
  },

  pullSessions(since: number, clientId?: string): Promise<{ sessions: RemoteSession[] }> {
    const suffix = clientId ? `&clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/sessions?since=${since}${suffix}`);
  },

  pushSplits(splits: RemoteSplit[]): Promise<void> {
    return apiClient.fetch("/sync/splits", {
      method: "POST",
      body: JSON.stringify({ splits }),
    });
  },

  pullSplits(since: number, clientId?: string): Promise<{ splits: RemoteSplit[] }> {
    const suffix = clientId ? `&clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/splits?since=${since}${suffix}`);
  },

  pushExercises(exercises: RemoteExercise[]): Promise<void> {
    return apiClient.fetch("/sync/exercises", {
      method: "POST",
      body: JSON.stringify({ exercises }),
    });
  },

  pullExercises(since: number, clientId?: string): Promise<{ exercises: RemoteExercise[] }> {
    const suffix = clientId ? `&clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/exercises?since=${since}${suffix}`);
  },

  pushProfile(profile: RemoteProfile): Promise<void> {
    return apiClient.fetch("/sync/profile", {
      method: "POST",
      body: JSON.stringify(profile),
    });
  },

  pushCheckinSubmissions(submissions: RemoteCheckinSubmission[]): Promise<void> {
    return apiClient.fetch("/sync/checkins", {
      method: "POST",
      body: JSON.stringify({ submissions }),
    });
  },

  pullCheckinSubmissions(
    since: number,
    clientId?: string,
  ): Promise<{ submissions: RemoteCheckinSubmission[] }> {
    const suffix = clientId ? `&clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/checkins?since=${since}${suffix}`);
  },

  pullProfile(clientId?: string): Promise<{ profile: RemoteProfile | null }> {
    const suffix = clientId ? `?clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/profile${suffix}`);
  },

  // ── Nutrition ──────────────────────────────────────────────────────────────

  pushNutritionDays(days: RemoteNutritionDay[]): Promise<void> {
    return apiClient.fetch("/sync/nutrition/days", {
      method: "POST",
      body: JSON.stringify({ days }),
    });
  },

  pullNutritionDays(
    since: number,
    clientId?: string,
  ): Promise<{ days: RemoteNutritionDay[] }> {
    const suffix = clientId ? `&clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/nutrition/days?since=${since}${suffix}`);
  },

  pushCustomFoods(foods: RemoteCustomFood[]): Promise<void> {
    return apiClient.fetch("/sync/nutrition/custom-foods", {
      method: "POST",
      body: JSON.stringify({ foods }),
    });
  },

  pullCustomFoods(since: number): Promise<{ foods: RemoteCustomFood[] }> {
    return apiClient.fetch(`/sync/nutrition/custom-foods?since=${since}`);
  },

  pushRecipes(recipes: RemoteRecipe[]): Promise<void> {
    return apiClient.fetch("/sync/nutrition/recipes", {
      method: "POST",
      body: JSON.stringify({ recipes }),
    });
  },

  pullRecipes(since: number): Promise<{ recipes: RemoteRecipe[] }> {
    return apiClient.fetch(`/sync/nutrition/recipes?since=${since}`);
  },

  pushFavorites(favorites: RemoteFavoriteFood[]): Promise<void> {
    return apiClient.fetch("/sync/nutrition/favorites", {
      method: "POST",
      body: JSON.stringify({ favorites }),
    });
  },

  pullFavorites(since: number): Promise<{ favorites: RemoteFavoriteFood[] }> {
    return apiClient.fetch(`/sync/nutrition/favorites?since=${since}`);
  },

  pushMealTemplates(templates: RemoteMealTemplate[]): Promise<void> {
    return apiClient.fetch("/sync/nutrition/meal-templates", {
      method: "POST",
      body: JSON.stringify({ templates }),
    });
  },

  pullMealTemplates(since: number): Promise<{ templates: RemoteMealTemplate[] }> {
    return apiClient.fetch(`/sync/nutrition/meal-templates?since=${since}`);
  },

  pushWeightEntries(entries: RemoteWeightEntry[]): Promise<void> {
    return apiClient.fetch("/sync/nutrition/weight", {
      method: "POST",
      body: JSON.stringify({ entries }),
    });
  },

  pullWeightEntries(
    since: number,
    clientId?: string,
  ): Promise<{ entries: RemoteWeightEntry[] }> {
    const suffix = clientId ? `&clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/nutrition/weight?since=${since}${suffix}`);
  },

  pushNutritionGoal(goal: RemoteNutritionGoal): Promise<void> {
    return apiClient.fetch("/sync/nutrition/goal", {
      method: "POST",
      body: JSON.stringify(goal),
    });
  },

  pullNutritionGoal(clientId?: string): Promise<{ goal: RemoteNutritionGoal | null }> {
    const suffix = clientId ? `?clientId=${clientId}` : "";
    return apiClient.fetch(`/sync/nutrition/goal${suffix}`);
  },
};
