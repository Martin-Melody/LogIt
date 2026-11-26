<!-- A photo in a message (design canvas M5/M8, C1): its own shape before it loads, tap for full
     screen. In a request you haven't accepted it's a blurred block with a lock. -->
<script lang="ts">
  import { ImageOff, Lock } from "lucide-svelte";
  import { photoSrc } from "@logit/core/api/photosApi";
  import PhotoViewer from "./PhotoViewer.svelte";

  const { url, width, height, hidden = false, mine = false, dim = false, bare = false }: {
    url: string | null;
    width: number;
    height: number;
    hidden?: boolean;
    mine?: boolean;
    /** Still sending. */
    dim?: boolean;
    /** Inside a bubble with its caption: the bubble draws the edge. */
    bare?: boolean;
  } = $props();

  let broken = $state(false);
  let open = $state(false);
  // Fit inside 240 × 300, keeping its shape (a square-ish block when the size is unknown).
  const box = $derived.by(() => {
    const w = width || 4, h = height || 5;
    const scale = Math.min(240 / w, 300 / h);
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  });
</script>

{#if hidden}
  <div class="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-muted text-[13px] font-medium text-muted-foreground" style="width: {box.w}px; height: {box.h}px">
    <Lock class="size-5" />Accept to see it
  </div>
{:else if broken || !url}
  <div class="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border text-[13px] text-muted-foreground" style="width: {Math.min(box.w, 200)}px; height: 120px">
    <ImageOff class="size-5" />Photo unavailable
  </div>
{:else}
  <button type="button" aria-label="Open photo" class="block shrink-0 overflow-hidden bg-muted transition-opacity {bare ? '' : 'rounded-2xl border border-border'} {dim ? 'opacity-60' : ''} {mine ? 'self-end' : ''}" style="width: {bare ? Math.max(box.w, 220) : box.w}px; height: {box.h}px" onclick={() => (open = true)}>
    <img src={photoSrc(url)} alt="" loading="lazy" class="size-full object-cover" onerror={() => (broken = true)} />
  </button>
  {#if open}<PhotoViewer src={photoSrc(url)!} onclose={() => (open = false)} />{/if}
{/if}
