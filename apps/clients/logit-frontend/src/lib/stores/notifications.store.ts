import { get, writable } from "svelte/store";
import { notificationsApi } from "@logit/core/api/socialApi";
import { authStore } from "$lib/api/authStore.svelte";

/** Unread social-notification count, for the badge on the bell + Social nav item. */
function createUnreadStore() {
  const store = writable(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!authStore.isAuthenticated) {
      store.set(0);
      return;
    }
    try {
      store.set(await notificationsApi.unreadCount());
    } catch {
      // keep the last value
    }
  }

  function refreshWhenVisible() {
    if (document.visibilityState === "visible") void refresh();
  }

  /** Start periodic refresh (from startBackgroundSync, once a user is signed in). */
  function start() {
    if (timer) return;
    void refresh();
    timer = setInterval(refresh, 60_000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refreshWhenVisible);
  }

  /** Stop refreshing and clear the badge (on logout). */
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refreshWhenVisible);
    store.set(0);
  }

  return {
    subscribe: store.subscribe,
    refresh,
    start,
    stop,
    clear: () => store.set(0),
    decrement: (by = 1) => store.set(Math.max(0, get(store) - by)),
  };
}

export const unreadNotifications = createUnreadStore();
