import { apiClient } from "./client";
import type { Sharing } from "./coachApi";

/** One sample client in a coach's sandbox (see services/api Features/Sandbox). */
export type SandboxClient = {
  userId: string;
  username: string;
  displayName: string;
  /** "niamh", "conor", "dara": which sample it is (guide/sandbox.ts). */
  key: string;
  relationshipId: string | null;
  /** "None" (not coached yet), "Pending", "Active", "Revoked", "Paused". */
  status: string;
};

export const sandboxApi = {
  async list(): Promise<SandboxClient[]> {
    const { clients } = await apiClient.fetch<{ clients: SandboxClient[] }>("/coach/sandbox");
    return clients;
  },
  async create(clients: { key: string; displayName: string; active: boolean; sharing?: Sharing }[]): Promise<SandboxClient[]> {
    const res = await apiClient.fetch<{ clients: SandboxClient[] }>("/coach/sandbox", {
      method: "POST",
      body: JSON.stringify({ clients }),
    });
    return res.clients;
  },
  async remove(): Promise<number> {
    const { removed } = await apiClient.fetch<{ removed: number }>("/coach/sandbox", { method: "DELETE" });
    return removed;
  },
  /** A short-lived token to act as one sample client (use with withToken). */
  async token(userId: string): Promise<string> {
    const { accessToken } = await apiClient.fetch<{ accessToken: string }>(`/coach/sandbox/clients/${userId}/token`, { method: "POST" });
    return accessToken;
  },
};
