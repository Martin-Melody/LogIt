import { viewingClient } from "$lib/viewingClient.svelte";

/** A client's name for breadcrumbs, from the client list the layout loads. */
export function clientName(id: string, fallback = "Client"): string {
  const c = viewingClient.clients.find((x) => x.client.id === id)?.client;
  return c ? c.displayName || c.username : fallback;
}
