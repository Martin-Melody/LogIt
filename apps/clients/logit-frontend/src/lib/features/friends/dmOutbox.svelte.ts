// Messages that haven't reached the server yet (journey F3: "a message waits and sends when
// back, with a visible Not sent yet"). Kept per account in localStorage and sent in order;
// the client id makes a resend after a dropped connection safe.
import { ApiError } from "@logit/core/api/client";
import { dmApi, type DmTo } from "@logit/core/api/dmApi";
import type { SentPhoto } from "@logit/core/api/photosApi";
import type { MessageVoice } from "@logit/core/api/voiceApi";
import { authStore } from "$lib/api/authStore.svelte";

export interface PendingDm {
  clientId: string;
  to: DmTo;
  body: string;
  card?: { type: string; json: string };
  /** Already uploaded (photos need a connection); only its id is sent with the message. */
  photo?: SentPhoto;
  /** Also uploaded already. */
  voice?: MessageVoice;
  createdAtMs: number;
  /** Set when the server refused it (blocked, their controls): shown instead of retrying. */
  error?: string;
}

const key = () => `logit:dm-outbox:${authStore.user?.id ?? "anon"}`;
const read = (): PendingDm[] => {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? "[]");
  } catch {
    return [];
  }
};

export const outbox = $state({ items: [] as PendingDm[], account: "" });

function load() {
  if (outbox.account !== key()) outbox.items = read();
  outbox.account = key();
}
function save() {
  localStorage.setItem(key(), JSON.stringify(outbox.items));
}

/** Same conversation? (A thread id and a username can name the same one; the page passes both.) */
export const sameChat = (a: DmTo, b: DmTo) =>
  ("username" in a && "username" in b && a.username === b.username) || ("threadId" in a && "threadId" in b && a.threadId === b.threadId);

let flushing: Promise<void> | null = null;

/** Sends what's waiting, oldest first. Stops at the first one that can't get through. */
export function flushOutbox(): Promise<void> {
  load();
  // Set before running: with nothing to send the body finishes at once, and clearing the
  // marker inside it would happen before `flushing` was assigned (it would never clear).
  if (!flushing) flushing = sendWaiting().finally(() => (flushing = null));
  return flushing;
}

async function sendWaiting(): Promise<void> {
  await Promise.resolve();
  for (const p of [...outbox.items]) {
    if (p.error) continue;
    try {
      await dmApi.send($state.snapshot(p.to), p.clientId, p.body, {
        card: p.card ? $state.snapshot(p.card) : undefined,
        photoId: p.photo?.id,
        voice: p.voice?.id ? { id: p.voice.id, peaks: p.voice.peaks } : undefined,
      });
      outbox.items = outbox.items.filter((x) => x.clientId !== p.clientId);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500 || e.status === 429) break; // offline or the server's trouble: later
      outbox.items = outbox.items.map((x) => (x.clientId === p.clientId ? { ...x, error: e.message } : x));
    }
    save();
  }
}

export function queueDm(to: DmTo, body: string, extra: { card?: { type: string; json: string }; photo?: SentPhoto; voice?: MessageVoice } = {}): Promise<void> {
  load();
  const { card, photo, voice } = extra;
  outbox.items = [...outbox.items, { clientId: crypto.randomUUID(), to, body, ...(card ? { card } : {}), ...(photo ? { photo } : {}), ...(voice ? { voice } : {}), createdAtMs: Date.now() }];
  save();
  return flushOutbox();
}

export function retryDm(clientId: string): Promise<void> {
  outbox.items = outbox.items.map((x) => (x.clientId === clientId ? { ...x, error: undefined } : x));
  save();
  return flushOutbox();
}

export function discardDm(clientId: string): void {
  outbox.items = outbox.items.filter((x) => x.clientId !== clientId);
  save();
}

let started = false;
/** Sends waiting messages at start and whenever the connection comes back. */
export function startOutbox(): void {
  if (started) return;
  started = true;
  window.addEventListener("online", () => void flushOutbox());
  if (authStore.isAuthenticated) void flushOutbox();
}
