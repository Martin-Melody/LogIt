import type { Snippet } from "svelte";

/**
 * The page content of the shared top header. Pages hand their header (back button,
 * title, buttons) to the layout with <PageHeader>; the layout draws it above <main>
 * with the notifications bell. A stack, so when two are mounted at once (a page
 * switching between header variants, or the old page during navigation) the newest
 * shows, and removing one never clears another's.
 *
 * The stack is a plain array, not $state: during navigation the new page registers in
 * one update batch and the old page unregisters in another, and a $state array written
 * from both kept only the later batch's view of it (the header vanished). `rev` is just
 * the signal to re-read; a fresh object each time, so no batch can see "unchanged".
 */
type Entry = { id: number; content: Snippet };

let nextId = 0;
const stack: Entry[] = [];
let rev = $state.raw({});

function changed() {
  rev = {};
}

export const headerSlot = {
  /** The header content to draw, or null when the page has no header. */
  get current(): Snippet | null {
    void rev;
    return stack.at(-1)?.content ?? null;
  },
};

/** Show `content` in the shared header until the returned function is called. */
export function registerHeader(content: Snippet): () => void {
  const id = ++nextId;
  stack.push({ id, content });
  changed();
  return () => {
    const i = stack.findIndex((e) => e.id === id);
    if (i < 0) return;
    stack.splice(i, 1);
    changed();
  };
}
