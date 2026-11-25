<!-- A story's photo filling its frame (design canvas S5/S6). A tall photo fills it edge to edge;
     a wide one is shown whole on black, so nobody's head is cropped off. -->
<script lang="ts">
  const { src, width = 0, height = 0, onload }: { src: string; width?: number; height?: number; onload?: () => void } = $props();

  let natural = $state<{ w: number; h: number } | null>(null);
  const tall = $derived.by(() => {
    const w = width || natural?.w || 9, h = height || natural?.h || 16;
    return h / w >= 1.2;
  });
</script>

<img
  {src}
  alt=""
  draggable="false"
  class="pointer-events-none absolute inset-0 size-full select-none {tall ? 'object-cover' : 'object-contain'}"
  onload={(e) => { const i = e.currentTarget as HTMLImageElement; natural = { w: i.naturalWidth, h: i.naturalHeight }; onload?.(); }}
  onerror={() => onload?.()}
/>
