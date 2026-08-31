import { Capacitor } from "@capacitor/core";
import { parseNutritionLabel, type ParsedLabel } from "@logit/core/nutrition/labelParser";

// Nutrition-label text extraction. Native only: Google ML Kit on-device text
// recognition (bundled Latin model — offline, fast). ML Kit returns per-line
// bounding boxes, which we use to rebuild the table in reading order — labels
// are often photographed sideways, and the flat `.text` interleaves the columns.

export interface LabelScanResult extends ParsedLabel {
  ms: number;
}

const TIMEOUT_MS = 30_000;

export function labelOcrAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`OCR timed out after ${ms} ms`)), ms),
    ),
  ]);
}

export async function scanLabel(path: string): Promise<LabelScanResult> {
  const started = performance.now();
  const { TextRecognition } = await import("@capacitor-mlkit/text-recognition");
  const res = await withTimeout(TextRecognition.processImage({ path }), TIMEOUT_MS);

  // Parse both the geometry-rebuilt text and ML Kit's flat text, keep the better.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rebuilt = reconstructText((res as any).blocks ?? []);
  const a = parseNutritionLabel(rebuilt);
  const b = parseNutritionLabel(res.text ?? "");
  const parsed = b.confidence > a.confidence ? b : a;

  console.log(
    `[labelOcr] flat ${(res.text ?? "").length}c/${b.confidence} · rebuilt ${rebuilt.length}c/${a.confidence} → ${parsed.layout}`,
  );
  return { ...parsed, ms: Math.round(performance.now() - started) };
}

// ── Geometry → reading order ──────────────────────────────────────────────────

type Pt = { x: number; y: number };
type Ln = { text: string; cx: number; cy: number; h: number; angle: number };

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((p, q) => p - q);
  return s[s.length >> 1];
}

function lineGeom(line: {
  text: string;
  cornerPoints?: Pt[];
  boundingBox?: { left: number; top: number; right: number; bottom: number };
}): Ln | null {
  const t = (line.text ?? "").trim();
  if (!t) return null;
  const cp = line.cornerPoints;
  if (cp && cp.length === 4) {
    const [tl, tr, , bl] = cp;
    return {
      text: t,
      cx: (cp[0].x + cp[1].x + cp[2].x + cp[3].x) / 4,
      cy: (cp[0].y + cp[1].y + cp[2].y + cp[3].y) / 4,
      h: Math.hypot(bl.x - tl.x, bl.y - tl.y) || 1,
      angle: Math.atan2(tr.y - tl.y, tr.x - tl.x),
    };
  }
  const bb = line.boundingBox;
  if (bb) {
    return {
      text: t,
      cx: (bb.left + bb.right) / 2,
      cy: (bb.top + bb.bottom) / 2,
      h: Math.max(1, bb.bottom - bb.top),
      angle: 0,
    };
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reconstructText(blocks: any[]): string {
  const lines: Ln[] = [];
  for (const b of blocks) {
    for (const l of b?.lines ?? []) {
      const g = lineGeom(l);
      if (g) lines.push(g);
    }
  }
  if (lines.length < 3) return blocks.map((b) => b?.text ?? "").join("\n");

  // De-rotate: snap the dominant text angle to the nearest right angle.
  const snap = Math.round(median(lines.map((l) => l.angle)) / (Math.PI / 2)) * (Math.PI / 2);
  const cos = Math.cos(-snap);
  const sin = Math.sin(-snap);
  const rot = lines.map((l) => ({
    text: l.text,
    x: l.cx * cos - l.cy * sin,
    y: l.cx * sin + l.cy * cos,
    h: l.h,
  }));

  const rowGap = 0.6 * (median(rot.map((l) => l.h)) || 12);
  rot.sort((p, q) => p.y - q.y);
  const rows: { y: number; items: typeof rot }[] = [];
  for (const l of rot) {
    const row = rows.find((r) => Math.abs(r.y - l.y) <= rowGap);
    if (row) {
      row.items.push(l);
      row.y = row.items.reduce((s, i) => s + i.y, 0) / row.items.length;
    } else {
      rows.push({ y: l.y, items: [l] });
    }
  }
  return rows
    .map((r) =>
      r.items
        .sort((p, q) => p.x - q.x)
        .map((i) => i.text)
        .join(" "),
    )
    .join("\n");
}
