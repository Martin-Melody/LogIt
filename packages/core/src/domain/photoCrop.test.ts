import { describe, expect, it } from "vitest";
import { centred, clampView, cropRect, fitFrame, outputSize, pan, zoomAt } from "./photoCrop";

const tall = { w: 3000, h: 4000 };
const square = { w: 300, h: 300 };

describe("photoCrop", () => {
  it("starts centred, covering the frame", () => {
    const v = centred(tall, square);
    expect(cropRect(tall, square, v)).toEqual({ x: 0, y: 500, w: 3000, h: 3000 });
  });

  it("can move up to the top of a tall photo but no further", () => {
    const v = pan(tall, square, centred(tall, square), 0, 10_000);
    expect(cropRect(tall, square, v)).toEqual({ x: 0, y: 0, w: 3000, h: 3000 });
  });

  it("zooms around the given point and never below 1 or above 4", () => {
    const v = zoomAt(tall, square, centred(tall, square), 2, 0, -150);
    const r = cropRect(tall, square, v);
    expect(r.w).toBe(1500);
    // The point at the top edge of the frame (y = 500 in the photo) stays put.
    expect(r.y).toBe(500);
    expect(clampView(tall, square, { ...v, zoom: 0.2 }).zoom).toBe(1);
    expect(clampView(tall, square, { ...v, zoom: 99 }).zoom).toBe(4);
  });

  it("fits frames and limits output size", () => {
    expect(fitFrame({ w: 400, h: 600 }, 1, tall)).toEqual({ w: 400, h: 400 });
    expect(fitFrame({ w: 400, h: 600 }, null, tall)).toEqual({ w: 400, h: 400 * 4 / 3 });
    expect(outputSize({ x: 0, y: 0, w: 3000, h: 3000 }, 512)).toEqual({ w: 512, h: 512 });
    expect(outputSize({ x: 0, y: 0, w: 200, h: 100 }, 512)).toEqual({ w: 200, h: 100 });
  });
});
