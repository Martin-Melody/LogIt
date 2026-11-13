import { derived, writable } from "svelte/store";
import type { ProgressionChange } from "@logit/core/domain/progression";
import type { SessionPR } from "@logit/core/usecases/progression/getSessionPRs";
import { getActiveOwnerId, onActiveOwnerChange } from "$lib/data/activeOwner";

/**
 * Notifications made on the device (PRs, progression changes), shown in the inbox next to
 * the social ones from the server. Stored per local account in localStorage, so they work
 * offline and signed out. Weights are stored in kg and formatted when shown, so a unit
 * change applies to old entries too.
 */

type Base = { id: string; createdAtMs: number; read: boolean; exerciseName: string; exerciseId?: string };

export type LocalNotification =
  | (Base & { kind: "pr"; prKind: "weight" | "reps"; weightKg: number; reps: number })
  | (Base & { kind: "progression"; change: ProgressionChange })
  /** A goal reached. `exerciseName` holds the goal's title. */
  | (Base & { kind: "goal"; goalId: string });

export type LocalNotificationKind = LocalNotification["kind"];

const MAX_ITEMS = 100;

function storageKey(): string {
  return `logit:inbox:v1:${getActiveOwnerId() ?? "local"}`;
}

function read(): LocalNotification[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    const parsed = raw ? (JSON.parse(raw) as LocalNotification[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: LocalNotification[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items));
  } catch {
    // Storage full or blocked: the inbox just won't keep these.
  }
}

/** Notifications worth sending for a finished session's PRs. A first-ever set isn't one. */
export function prNotifications(prs: SessionPR[], nowMs: number): LocalNotification[] {
  return prs
    .filter((p): p is SessionPR & { kind: "weight" | "reps" } => p.kind === "weight" || p.kind === "reps")
    .map((p, i) => ({
      id: `pr-${nowMs}-${i}`,
      kind: "pr",
      createdAtMs: nowMs,
      read: false,
      exerciseName: p.exerciseName,
      exerciseId: p.exerciseId,
      prKind: p.kind,
      weightKg: p.weight,
      reps: p.reps,
    }));
}

/** A notification for a progression change worth knowing about: the target went up, or a deload. */
export function progressionNotification(
  exercise: { id?: string; name: string },
  change: ProgressionChange | undefined,
  nowMs: number,
  index = 0,
): Extract<LocalNotification, { kind: "progression" }> | null {
  if (!change || (change.kind !== "increase" && change.kind !== "deload")) return null;
  return {
    id: `prog-${nowMs}-${index}`,
    kind: "progression",
    createdAtMs: nowMs,
    read: false,
    exerciseName: exercise.name,
    exerciseId: exercise.id,
    change,
  };
}

/** A notification per goal reached in the session just finished. */
export function goalNotifications(goals: { id: string; title: string; exerciseId?: string }[], nowMs: number): LocalNotification[] {
  return goals.map((g, i) => ({
    id: `goal-${nowMs}-${i}`,
    kind: "goal",
    createdAtMs: nowMs,
    read: false,
    exerciseName: g.title,
    exerciseId: g.exerciseId,
    goalId: g.id,
  }));
}

function createLocalInbox() {
  const store = writable<LocalNotification[]>(read());

  function set(items: LocalNotification[]) {
    const capped = items.slice(0, MAX_ITEMS);
    write(capped);
    store.set(capped);
  }

  return {
    subscribe: store.subscribe,
    /** Re-read storage (after switching account). */
    reload() {
      store.set(read());
    },
    add(items: LocalNotification[]) {
      if (items.length === 0) return;
      set([...items, ...read()].sort((a, b) => b.createdAtMs - a.createdAtMs));
    },
    markAllRead() {
      const items = read();
      if (items.every((n) => n.read)) return;
      set(items.map((n) => (n.read ? n : { ...n, read: true })));
    },
    remove(id: string) {
      set(read().filter((n) => n.id !== id));
    },
  };
}

export const localInbox = createLocalInbox();
onActiveOwnerChange(() => localInbox.reload());

export const localUnread = derived(localInbox, (items) => items.filter((n) => !n.read).length);
