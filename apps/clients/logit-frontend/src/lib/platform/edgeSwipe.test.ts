import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A swipe on a set row that starts at the screen edge reaches the app as touchstart, then
// Android's back. That back goes to the row instead of leaving the screen.
describe("edge swipes on set rows", () => {
  let start: ((e: unknown) => void) | null = null;
  const row = { isConnected: true, dispatchEvent: vi.fn() };
  let rowAtHeight = false;
  const touch = (x: number, onRow = true) =>
    start?.({ touches: [{ clientX: x, clientY: 300 }], target: { closest: () => (onRow ? row : null) } });

  beforeEach(async () => {
    vi.resetModules();
    row.dispatchEvent.mockClear();
    vi.stubGlobal("window", { innerWidth: 400 });
    rowAtHeight = false;
    vi.stubGlobal("document", {
      addEventListener: (_: string, fn: (e: unknown) => void) => (start = fn),
      elementFromPoint: () => ({ closest: () => (rowAtHeight ? row : null) }),
    });
    (await import("./edgeSwipe")).watchEdgeSwipes();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a back right after a touch at the right edge of a row opens the row instead", async () => {
    const { takeEdgeSwipe } = await import("./edgeSwipe");
    touch(390);
    expect(takeEdgeSwipe()).toBe(true);
    const event = row.dispatchEvent.mock.calls[0]![0] as CustomEvent<{ fromRight: boolean }>;
    expect(event.type).toBe("edgeswipe");
    expect(event.detail.fromRight).toBe(true);
    // Only once: the next back is a real back.
    expect(takeEdgeSwipe()).toBe(false);
  });

  it("right at the edge the finger can miss the row; the row at that height counts", async () => {
    const { takeEdgeSwipe } = await import("./edgeSwipe");
    rowAtHeight = true;
    touch(411, false);
    expect(takeEdgeSwipe()).toBe(true);
  });

  it("from the left edge it's a swipe to the right", async () => {
    const { takeEdgeSwipe } = await import("./edgeSwipe");
    touch(5);
    expect(takeEdgeSwipe()).toBe(true);
    expect((row.dispatchEvent.mock.calls[0]![0] as CustomEvent<{ fromRight: boolean }>).detail.fromRight).toBe(false);
  });

  it("a real back: away from the edge, not on a row, or too long after", async () => {
    const { takeEdgeSwipe } = await import("./edgeSwipe");
    touch(200);
    expect(takeEdgeSwipe()).toBe(false);
    touch(390, false);
    expect(takeEdgeSwipe()).toBe(false);
    touch(390);
    expect(takeEdgeSwipe(performance.now() + 2000)).toBe(false);
    expect(row.dispatchEvent).not.toHaveBeenCalled();
  });
});
