// The LogIt staircase mark — canonical source for every app icon, splash screen, and
// favicon in this repo is scripts/brand-mark.png (512x512, mark + solid dark background
// composited together; no vector source exists, it was designed and exported as a raster).
// This module derives the layers every consumer actually needs from that one file:
//   - the flat composite, for a simple single-layer icon/favicon
//   - a transparent-background alpha layer, for Android's adaptive icon foreground
//   - the plain background fill, for Android's adaptive icon background
// Used by apps/clients/logit-frontend/scripts/gen-app-assets.mjs (mobile icon/splash) and
// scripts/gen-favicons.mjs (every web app's favicon) so they can't drift apart again — see
// docs/bugs/ for the "wrong stairs logo" writeup, if one exists, or just: don't hand-edit
// favicon.png or the mobile assets/ folder, re-run the generators instead.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const MARK_PATH = join(here, "brand-mark.png");

/** The composited mark (dark bg + light stairs), resized to `size`x`size`. */
export async function markComposite(size) {
  return sharp(MARK_PATH).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
}

/**
 * Sample the mark's background color from a corner pixel (the composite is flat-filled
 * there, no anti-aliasing to worry about).
 */
export async function backgroundColor() {
  const { data } = await sharp(MARK_PATH)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The stairs alone, as a white shape with an alpha channel derived from luminance — dark
 * background pixels become transparent, the light stroke stays opaque. This is what
 * Android's adaptive icon foreground layer (and the splash mark) need: art that isn't
 * assuming any particular background underneath it.
 */
export async function markForeground(size) {
  const src = sharp(MARK_PATH)
    .resize(size, size, { kernel: "lanczos3" })
    .removeAlpha();
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += channels, p += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    // Background sampled at ~14/255, the stroke peaks at 255 — map that range to alpha.
    let alpha = Math.max(0, Math.min(255, Math.round(((lum - 14) / (255 - 14)) * 255)));
    // Compression/resize noise on background pixels rounds to a few units of alpha instead
    // of a clean 0 — invisible pixel-by-pixel, but composited as a filled rectangle it shows
    // up as a faint ghost box the size of the resized layer's bounding box. Floor it out.
    if (alpha < 12) alpha = 0;
    out[p] = 255;
    out[p + 1] = 255;
    out[p + 2] = 255;
    out[p + 3] = alpha;
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** A solid fill of the mark's background color, `size`x`size`. */
export async function backgroundFill(size) {
  const bg = await backgroundColor();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .png()
    .toBuffer();
}

/** The foreground mark alone, scaled to `markFrac` of `size` and centred on `bg` (or transparent if bg is null). */
export async function composedOnBg({ size, markFrac, bg }) {
  const markSize = Math.round(size * markFrac);
  const fg = await markForeground(markSize);
  const off = Math.round((size - markSize) / 2);
  const base = bg
    ? sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([{ input: fg, left: off, top: off }]).png().toBuffer();
}
