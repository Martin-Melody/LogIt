// The maths behind the photo cropper (design canvas U3/U5/U6): a frame of a fixed shape sits over
// the photo; the person moves the photo under it and zooms. Zoom 1 = the photo just covers the
// frame. Everything is in photo pixels so the result doesn't depend on the screen size.

export type Size = { w: number; h: number };
/** What the frame shows: its centre in photo pixels, and the zoom (1 = photo just covers the frame). */
export type CropView = { cx: number; cy: number; zoom: number };
export type CropRect = { x: number; y: number; w: number; h: number };

export const MAX_ZOOM = 4;

/** Photo pixels → screen pixels at this zoom, for a frame drawn `frame` big on screen. */
export function screenScale(photo: Size, frame: Size, zoom: number): number {
  return Math.max(frame.w / photo.w, frame.h / photo.h) * zoom;
}

/** Keeps the frame on the photo: zoom between 1 and MAX_ZOOM, centre where no empty edge shows. */
export function clampView(photo: Size, frame: Size, v: CropView): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const s = screenScale(photo, frame, zoom);
  const halfW = frame.w / s / 2;
  const halfH = frame.h / s / 2;
  return {
    zoom,
    cx: Math.min(photo.w - halfW, Math.max(halfW, v.cx)),
    cy: Math.min(photo.h - halfH, Math.max(halfH, v.cy)),
  };
}

export function centred(photo: Size, frame: Size): CropView {
  return clampView(photo, frame, { cx: photo.w / 2, cy: photo.h / 2, zoom: 1 });
}

/** Dragging the photo by (dx, dy) screen pixels moves the frame the other way. */
export function pan(photo: Size, frame: Size, v: CropView, dx: number, dy: number): CropView {
  const s = screenScale(photo, frame, v.zoom);
  return clampView(photo, frame, { ...v, cx: v.cx - dx / s, cy: v.cy - dy / s });
}

/**
 * Zoom to `zoom`, keeping the photo point under (fx, fy) still; fx/fy are screen pixels from the
 * frame's centre (a pinch's midpoint, the mouse); 0, 0 zooms on the middle of the frame.
 */
export function zoomAt(photo: Size, frame: Size, v: CropView, zoom: number, fx = 0, fy = 0): CropView {
  const before = screenScale(photo, frame, v.zoom);
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const after = screenScale(photo, frame, z);
  const px = v.cx + fx / before;
  const py = v.cy + fy / before;
  return clampView(photo, frame, { zoom: z, cx: px - fx / after, cy: py - fy / after });
}

/** The part of the photo inside the frame, in whole photo pixels. */
export function cropRect(photo: Size, frame: Size, v: CropView): CropRect {
  const s = screenScale(photo, frame, v.zoom);
  const w = Math.min(photo.w, frame.w / s);
  const h = Math.min(photo.h, frame.h / s);
  const x = Math.min(photo.w - w, Math.max(0, v.cx - w / 2));
  const y = Math.min(photo.h - h, Math.max(0, v.cy - h / 2));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** The biggest frame of this aspect (w/h; null = the photo's own) that fits in `box`. */
export function fitFrame(box: Size, aspect: number | null, photo: Size): Size {
  const a = aspect ?? photo.w / photo.h;
  return box.w / box.h > a ? { w: box.h * a, h: box.h } : { w: box.w, h: box.w / a };
}

/** Output size for a crop, longest side at most maxPx, never upscaled. */
export function outputSize(rect: CropRect, maxPx: number): Size {
  const k = Math.min(1, maxPx / Math.max(rect.w, rect.h));
  return { w: Math.max(1, Math.round(rect.w * k)), h: Math.max(1, Math.round(rect.h * k)) };
}
