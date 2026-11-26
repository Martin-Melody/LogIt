<!--
  Move and zoom a photo under a frame (design canvas U3, U5, U6). Used by the phone app (full
  screen) and the web app (in a dialog); each wraps it in its own Cancel / Done. Drag or arrow
  keys move, pinch, the wheel, + / - or the slider zoom. Call `result()` for the cropped JPEG.
-->
<script lang="ts">
  import { centred, cropRect, fitFrame, MAX_ZOOM, outputSize, pan, screenScale, zoomAt, type CropView, type Size } from "@logit/core/domain/photoCrop";

  type Props = {
    /** The photo: an object URL or a data URL. */
    src: string;
    /** Frame width / height; null = the photo's own shape (nothing cut off at zoom 1). */
    aspect: number | null;
    /** Draws the frame as a circle (profile and group photos). */
    round?: boolean;
    class?: string;
  };
  const { src, aspect, round = false, class: className = "" }: Props = $props();

  let stageW = $state(0);
  let stageH = $state(0);
  let photo = $state<Size | null>(null);
  let img = $state<HTMLImageElement | null>(null);
  let view = $state<CropView>({ cx: 0, cy: 0, zoom: 1 });

  const PAD = 24;
  const frame = $derived<Size | null>(photo && stageW > PAD * 2 && stageH > PAD * 2 ? fitFrame({ w: stageW - PAD * 2, h: stageH - PAD * 2 }, aspect, photo) : null);
  const scale = $derived(photo && frame ? screenScale(photo, frame, view.zoom) : 1);

  // A new photo, shape or stage size starts centred again.
  $effect(() => {
    if (photo && frame) view = centred(photo, frame);
  });

  function loaded(e: Event) {
    const el = e.currentTarget as HTMLImageElement;
    photo = { w: el.naturalWidth, h: el.naturalHeight };
  }

  const pointers = new Map<number, { x: number; y: number }>();

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function move(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev || !photo || !frame) return;
    if (pointers.size === 1) {
      view = pan(photo, frame, view, e.clientX - prev.x, e.clientY - prev.y);
    } else if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mx = (e.clientX + other.x) / 2 - rect.left - rect.width / 2;
        const my = (e.clientY + other.y) / 2 - rect.top - rect.height / 2;
        view = zoomAt(photo, frame, view, view.zoom * (after / before), mx, my);
        view = pan(photo, frame, view, (e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
      }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
  }

  function wheel(e: WheelEvent) {
    if (!photo || !frame) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    view = zoomAt(photo, frame, view, view.zoom * Math.exp(-e.deltaY * 0.002), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
  }

  function key(e: KeyboardEvent) {
    if (!photo || !frame) return;
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) view = pan(photo, frame, view, ...moves[e.key]!);
    else if (e.key === "+" || e.key === "=") view = zoomAt(photo, frame, view, view.zoom + 0.1);
    else if (e.key === "-") view = zoomAt(photo, frame, view, view.zoom - 0.1);
    else return;
    e.preventDefault();
  }

  function slide(e: Event) {
    if (photo && frame) view = zoomAt(photo, frame, view, Number((e.currentTarget as HTMLInputElement).value));
  }

  /** The part inside the frame as a JPEG data URL, longest side at most maxPx. */
  export async function result(maxPx: number, quality = 0.85): Promise<string> {
    if (!img || !photo || !frame) throw new Error("The photo hasn't loaded yet.");
    const r = cropRect(photo, frame, view);
    const out = outputSize(r, maxPx);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, out.w, out.h);
    return canvas.toDataURL("image/jpeg", quality);
  }
</script>

<div class="flex min-h-0 flex-col {className}">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (it takes arrow keys and + / -) -->
  <div
    bind:clientWidth={stageW}
    bind:clientHeight={stageH}
    role="application"
    aria-label="Photo position. Drag or use the arrow keys to move it; pinch, scroll or press plus and minus to zoom."
    tabindex="0"
    class="relative min-h-0 flex-1 touch-none overflow-hidden bg-black outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onwheel={wheel}
    onkeydown={key}
  >
    <img
      bind:this={img}
      {src}
      alt=""
      draggable="false"
      onload={loaded}
      class="pointer-events-none absolute max-w-none origin-top-left"
      style:visibility={photo && frame ? "visible" : "hidden"}
      style:width="{(photo?.w ?? 0) * scale}px"
      style:height="{(photo?.h ?? 0) * scale}px"
      style:left="{stageW / 2 - view.cx * scale}px"
      style:top="{stageH / 2 - view.cy * scale}px"
    />
    {#if frame}
      <span
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_9999px_rgb(0_0_0/0.62)] outline-[1.5px] outline-white/70 outline-solid {round ? 'rounded-full' : 'rounded-[3px]'}"
        style:width="{frame.w}px"
        style:height="{frame.h}px"
      ></span>
    {/if}
  </div>
  <div class="flex items-center gap-3 px-6 pt-4 pb-1 text-muted-foreground">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M8 11h6" /><path d="m21 21-4.3-4.3" /></svg>
    <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={view.zoom} oninput={slide} aria-label="Zoom" class="h-11 min-w-0 flex-1 accent-primary" />
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M8 11h6" /><path d="M11 8v6" /><path d="m21 21-4.3-4.3" /></svg>
  </div>
</div>
