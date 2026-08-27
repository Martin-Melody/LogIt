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
};
