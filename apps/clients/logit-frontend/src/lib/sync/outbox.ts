import { syncApi } from "@logit/core/api/syncApi";
import type { RemoteSession, RemoteSplit, RemoteExercise, RemoteProfile } from "@logit/core/api/syncApi";

const KEY = "logit:sync:outbox";

type OutboxEntry =
  | { type: "session"; dto: RemoteSession }
  | { type: "split"; dto: RemoteSplit }
  | { type: "exercise"; dto: RemoteExercise }
  | { type: "profile"; dto: RemoteProfile };

function load(): OutboxEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function save(entries: OutboxEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {}
}

export function enqueue(entry: OutboxEntry): void {
  const entries = load();
  entries.push(entry);
  save(entries);
}

export async function flush(): Promise<void> {
  const entries = load();
  if (entries.length === 0) return;

  // Clear atomically before attempting — new writes during flush will be separate entries
  save([]);

  const sessions = entries.filter((e): e is Extract<OutboxEntry, { type: "session" }> => e.type === "session").map(e => e.dto);
  const splits = entries.filter((e): e is Extract<OutboxEntry, { type: "split" }> => e.type === "split").map(e => e.dto);
  const exercises = entries.filter((e): e is Extract<OutboxEntry, { type: "exercise" }> => e.type === "exercise").map(e => e.dto);
  // For profile, only the most recent write matters
  const profileEntries = entries.filter((e): e is Extract<OutboxEntry, { type: "profile" }> => e.type === "profile");
  const profile = profileEntries.at(-1)?.dto;

  const failed: OutboxEntry[] = [];

  if (sessions.length) {
    try { await syncApi.pushSessions(sessions); }
    catch { sessions.forEach(dto => failed.push({ type: "session", dto })); }
  }
  if (splits.length) {
    try { await syncApi.pushSplits(splits); }
    catch { splits.forEach(dto => failed.push({ type: "split", dto })); }
  }
  if (exercises.length) {
    try { await syncApi.pushExercises(exercises); }
    catch { exercises.forEach(dto => failed.push({ type: "exercise", dto })); }
  }
  if (profile) {
    try { await syncApi.pushProfile(profile); }
    catch { failed.push({ type: "profile", dto: profile }); }
  }

  if (failed.length > 0) {
    // Prepend failed entries so they retry first; preserve any new entries queued during flush
    const newer = load();
    save([...failed, ...newer]);
  }
}
