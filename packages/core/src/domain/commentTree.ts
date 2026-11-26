// A post's comments as a tree (design canvas Q2; Martin's notes 25 Nov), Reddit's way: every
// reply sits under the comment it answers, one indent deeper. A comment shows its first three
// replies, then "Show N more replies"; past six levels a branch ends in "Continue this thread".

export const SHOWN_REPLIES = 3;
export const MAX_DEPTH = 6;

export interface TreeComment {
  id: string;
  parentId: string | null;
}

export interface Node<T extends TreeComment> {
  comment: T;
  depth: number;
  replies: Node<T>[];
}

/** Comments (in the order to show siblings, e.g. top first) into a tree. A reply whose parent
 * is missing goes to the top level. */
export function buildTree<T extends TreeComment>(comments: T[]): Node<T>[] {
  const nodes = new Map(comments.map((c) => [c.id, { comment: c, depth: 0, replies: [] as Node<T>[] }]));
  const roots: Node<T>[] = [];
  for (const c of comments) {
    const node = nodes.get(c.id)!;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    (parent ? parent.replies : roots).push(node);
  }
  const setDepth = (list: Node<T>[], d: number) => list.forEach((n) => { n.depth = d; setDepth(n.replies, d + 1); });
  setDepth(roots, 0);
  return roots;
}

export type Row<T extends TreeComment> =
  | { type: "comment"; node: Node<T> }
  | { type: "more"; parent: Node<T>; hidden: number; depth: number }
  | { type: "continue"; node: Node<T>; depth: number };

/** The rows to draw: comments in order, "Show N more replies" after the first three replies of a
 * comment (unless `expanded` has it), "Continue this thread" where the depth runs out, and nothing
 * under a comment in `folded`. */
export function visibleRows<T extends TreeComment>(roots: Node<T>[], expanded: Set<string>, folded: Set<string>, maxDepth = MAX_DEPTH): Row<T>[] {
  const rows: Row<T>[] = [];
  const walk = (node: Node<T>) => {
    rows.push({ type: "comment", node });
    if (folded.has(node.comment.id) || node.replies.length === 0) return;
    if (node.depth + 1 >= maxDepth) {
      rows.push({ type: "continue", node, depth: node.depth + 1 });
      return;
    }
    const all = expanded.has(node.comment.id);
    const shown = all ? node.replies : node.replies.slice(0, SHOWN_REPLIES);
    shown.forEach(walk);
    if (!all && node.replies.length > SHOWN_REPLIES) rows.push({ type: "more", parent: node, hidden: node.replies.length - SHOWN_REPLIES, depth: node.depth + 1 });
  };
  roots.forEach(walk);
  return rows;
}

/** How many comments sit under one (for "3 replies" on a folded comment). */
export const countUnder = <T extends TreeComment>(n: Node<T>): number => n.replies.reduce((s, r) => s + 1 + countUnder(r), 0);

/** The branch that starts at `id`, re-rooted (for "Continue this thread"). */
export function branch<T extends TreeComment>(roots: Node<T>[], id: string): Node<T>[] {
  const find = (list: Node<T>[]): Node<T> | undefined => {
    for (const n of list) {
      if (n.comment.id === id) return n;
      const f = find(n.replies);
      if (f) return f;
    }
  };
  const found = find(roots);
  if (!found) return [];
  const rebase = (n: Node<T>, d: number): Node<T> => ({ ...n, depth: d, replies: n.replies.map((r) => rebase(r, d + 1)) });
  return [rebase(found, 0)];
}
