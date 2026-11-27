// Pages that show what sample clients do reload on onSampleActivity. A module of its own with no
// imports, so it's ready before anything that registers a listener while loading (the client
// hover card does), whatever order the sandbox's own imports load in.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Call to reload when a sample client did something (asked to join, sent a check-in, replied). */
export function onSampleActivity(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function emitSampleActivity(): void {
  for (const l of listeners) l();
}
