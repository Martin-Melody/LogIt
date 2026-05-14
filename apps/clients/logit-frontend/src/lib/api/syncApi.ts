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
  updatedAtMs: number;
};

export const syncApi = {
  pushSessions(sessions: RemoteSession[]): Promise<void> {
    return apiClient.fetch("/sync/sessions", {
      method: "POST",
      body: JSON.stringify({ sessions }),
    });
  },

  pullSessions(since: number): Promise<{ sessions: RemoteSession[] }> {
    return apiClient.fetch(`/sync/sessions?since=${since}`);
  },

  pushSplits(splits: RemoteSplit[]): Promise<void> {
    return apiClient.fetch("/sync/splits", {
      method: "POST",
      body: JSON.stringify({ splits }),
    });
  },

  pullSplits(since: number): Promise<{ splits: RemoteSplit[] }> {
    return apiClient.fetch(`/sync/splits?since=${since}`);
  },

  pushExercises(exercises: RemoteExercise[]): Promise<void> {
    return apiClient.fetch("/sync/exercises", {
      method: "POST",
      body: JSON.stringify({ exercises }),
    });
  },

  pullExercises(since: number): Promise<{ exercises: RemoteExercise[] }> {
    return apiClient.fetch(`/sync/exercises?since=${since}`);
  },

  pushProfile(profile: RemoteProfile): Promise<void> {
    return apiClient.fetch("/sync/profile", {
      method: "POST",
      body: JSON.stringify(profile),
    });
  },

  pullProfile(): Promise<{ profile: RemoteProfile | null }> {
    return apiClient.fetch("/sync/profile");
  },
};
