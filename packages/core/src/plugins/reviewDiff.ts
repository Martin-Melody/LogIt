/** One line of a review diff: kept, added in the new version, or removed from the old one. */
export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/** Above this many old × new lines the table gets too big for the browser; show the code instead. */
export const MAX_DIFF_CELLS = 4_000_000;

/**
 * Line-by-line diff of two versions of a plugin's code (longest common subsequence), for the
 * admin's plugin review. Null when the files are too big to compare here.
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] | null {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length * b.length > MAX_DIFF_CELLS) return null;

  // lcs[i][j] = longest common run of a[i..] and b[j..], filled from the end.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ kind: "same", text: a[i] }); i++; j++; }
    else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) out.push({ kind: "del", text: a[i++] });
    else out.push({ kind: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] });
  while (j < b.length) out.push({ kind: "add", text: b[j++] });
  return out;
}

/** The diff with unchanged stretches cut down to `context` lines either side of a change. */
export function aroundChanges(lines: DiffLine[], context = 3): (DiffLine | { kind: "gap"; hidden: number })[] {
  const keep = lines.map(() => false);
  lines.forEach((l, n) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, n - context); k <= Math.min(lines.length - 1, n + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { kind: "gap"; hidden: number })[] = [];
  let hidden = 0;
  lines.forEach((l, n) => {
    if (keep[n]) {
      if (hidden) out.push({ kind: "gap", hidden });
      hidden = 0;
      out.push(l);
    } else hidden++;
  });
  if (hidden) out.push({ kind: "gap", hidden });
  return out;
}
