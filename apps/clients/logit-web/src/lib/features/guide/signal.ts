// Pages call guideSignal with a step's signal name right after the user has done something a walkthrough step
// waits for (saved a chart, accepted a request). A "do" step names the signal it waits for;
// packages/core/src/guide/consistency.test.ts checks every step's signal is sent somewhere
// and every signal sent is waited for. Always pass a plain string literal.

type Listener = (name: string) => void;
const listeners = new Set<Listener>();

export function guideSignal(name: string): void {
  for (const l of listeners) l(name);
}

export function onGuideSignal(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
