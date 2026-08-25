import { apiClient } from "./client";

export interface CoachClientUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ClientRelationship {
  relationshipId: string;
  client: CoachClientUser;
}

export interface ReceivedInvite {
  relationshipId: string;
  coach: CoachClientUser;
  createdAt: string;
}

export interface SentInvite {
  relationshipId: string;
  client: CoachClientUser;
  createdAt: string;
}

export const coachApi = {
  async inviteClient(username: string): Promise<void> {
    await apiClient.fetch(`/coach/clients/${username}/invite`, { method: "POST" });
  },

  async listClients(): Promise<ClientRelationship[]> {
    return apiClient.fetch("/coach/clients");
  },

  async listReceivedInvites(): Promise<ReceivedInvite[]> {
    return apiClient.fetch("/coach/invites/received");
  },

  async listSentInvites(): Promise<SentInvite[]> {
    return apiClient.fetch("/coach/invites/sent");
  },

  async acceptInvite(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/invites/${relationshipId}/accept`, { method: "POST" });
  },

  async declineInvite(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/invites/${relationshipId}/decline`, { method: "POST" });
  },

  async revokeRelationship(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/relationships/${relationshipId}`, { method: "DELETE" });
  },
};
