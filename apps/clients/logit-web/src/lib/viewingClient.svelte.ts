import type { ClientRelationship } from "@logit/core/api/coachApi";

/** Which account's data the dashboard is currently showing — `null` means the logged-in
 * user's own data. Set by the client-switcher in the top bar (+layout.svelte), read by
 * the overview and exercise-detail routes to scope getWebDeps() accordingly. */
let viewingClientId = $state<string | null>(null);
let clients = $state<ClientRelationship[]>([]);

export const viewingClient = {
  get id(): string | null {
    return viewingClientId;
  },
  set(id: string | null) {
    viewingClientId = id;
  },

  get clients(): ClientRelationship[] {
    return clients;
  },
  setClients(list: ClientRelationship[]) {
    clients = list;
    // If the client we were viewing got revoked/removed, fall back to "my data" rather
    // than silently keep requesting a client we no longer have access to.
    if (viewingClientId && !list.some((c) => c.client.id === viewingClientId)) {
      viewingClientId = null;
    }
  },

  get current(): ClientRelationship | null {
    return clients.find((c) => c.client.id === viewingClientId) ?? null;
  },
};
