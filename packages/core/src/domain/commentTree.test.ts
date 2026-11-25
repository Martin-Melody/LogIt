import { describe, expect, it } from "vitest";
import { branch, buildTree, countUnder, visibleRows } from "./commentTree";

const c = (id: string, parentId: string | null = null) => ({ id, parentId });
const ids = (rows: ReturnType<typeof visibleRows>) =>
  rows.map((r) => (r.type === "comment" ? `${"  ".repeat(r.node.depth)}${r.node.comment.id}` : r.type === "more" ? `more ${r.hidden} under ${r.parent.comment.id}` : `continue ${r.node.comment.id}`));

describe("comment tree", () => {
  it("nests replies under what they answer, as on Martin's sketch", () => {
    const tree = buildTree([c("a"), c("b"), c("b1", "b"), c("b2", "b"), c("b2x", "b2"), c("b3", "b"), c("z")]);
    expect(ids(visibleRows(tree, new Set(), new Set()))).toEqual(["a", "b", "  b1", "  b2", "    b2x", "  b3", "z"]);
  });
  it("shows three replies, then Show more; expanded shows all", () => {
    const tree = buildTree([c("p"), ...["1", "2", "3", "4", "5"].map((n) => c(`r${n}`, "p"))]);
    expect(ids(visibleRows(tree, new Set(), new Set()))).toEqual(["p", "  r1", "  r2", "  r3", "more 2 under p"]);
    expect(visibleRows(tree, new Set(["p"]), new Set())).toHaveLength(6);
  });
  it("folds a branch, stops deep threads with Continue, and re-roots a branch", () => {
    const chain = ["d0", "d1", "d2", "d3"].map((id, i) => c(id, i ? `d${i - 1}` : null));
    const tree = buildTree(chain);
    expect(ids(visibleRows(tree, new Set(), new Set(["d1"])))).toEqual(["d0", "  d1"]);
    expect(ids(visibleRows(tree, new Set(), new Set(), 2))).toEqual(["d0", "  d1", "continue d1"]);
    expect(countUnder(tree[0]!)).toBe(3);
    expect(ids(visibleRows(branch(tree, "d2"), new Set(), new Set()))).toEqual(["d2", "  d3"]);
  });
  it("puts a reply to a missing comment at the top level", () => {
    expect(buildTree([c("x", "gone")])[0]!.depth).toBe(0);
  });
});
