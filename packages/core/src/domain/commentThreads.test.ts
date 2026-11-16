import { describe, expect, it } from "vitest";
import { removedByDelete, repliesStartFolded, replyDraft, threadComments, threadIdFor } from "./commentThreads";

const c = (id: string, parentCommentId: string | null = null, authorUsername = "niamh") => ({ id, parentCommentId, authorUsername });

describe("comment threads", () => {
  it("puts replies under their comment, in order, whatever order they arrive in", () => {
    const threads = threadComments([c("a"), c("b"), c("r1", "a"), c("r2", "b"), c("r3", "a")]);
    expect(threads.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ["a", ["r1", "r3"]],
      ["b", ["r2"]],
    ]);
  });

  it("shows a reply whose comment is missing as its own thread", () => {
    expect(threadComments([c("a"), c("r", "gone")]).map((t) => t.comment.id)).toEqual(["a", "r"]);
  });

  it("folds threads with more than 3 replies", () => {
    expect(repliesStartFolded(3)).toBe(false);
    expect(repliesStartFolded(4)).toBe(true);
  });

  it("replies to a reply land in the same thread", () => {
    expect(threadIdFor(c("a"))).toBe("a");
    expect(threadIdFor(c("r", "a"))).toBe("a");
  });

  it("starts a reply with the @mention once", () => {
    expect(replyDraft(c("a", null, "conor"), "")).toBe("@conor ");
    expect(replyDraft(c("a", null, "conor"), "nice")).toBe("@conor nice");
    expect(replyDraft(c("a", null, "conor"), "@Conor nice")).toBe("@Conor nice");
  });

  it("deleting a comment removes its replies too", () => {
    const list = [c("a"), c("r1", "a"), c("b"), c("r2", "b")];
    expect(removedByDelete(list, "a")).toEqual(["a", "r1"]);
    expect(removedByDelete(list, "r2")).toEqual(["r2"]);
  });
});
