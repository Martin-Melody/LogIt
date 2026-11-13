<!--
  A phone frame around a real app screenshot (static/screens/<name>.webp, 780 × 1688).
  Everything scales from `width` so small and large phones look like the same device.
-->
<script lang="ts">
  let {
    name,
    alt,
    width = 290,
    eager = false,
    class: className = "",
  }: { name: string; alt: string; width?: number; eager?: boolean; class?: string } = $props();

  const pad = $derived(Math.round(width * 0.031));
  const outer = $derived(Math.round(width * 0.16));
  const inner = $derived(outer - pad);
  const top = $derived(Math.round(width * 0.105));
  const island = $derived({ w: Math.round(width * 0.29), h: Math.round(width * 0.078), y: Math.round(width * 0.034) });
</script>

<div
  class="shrink-0 bg-accent shadow-[0_30px_70px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.09)] {className}"
  style="width: {width}px; padding: {pad}px; border-radius: {outer}px"
>
  <div class="relative overflow-hidden bg-background" style="border-radius: {inner}px; padding-top: {top}px">
    <div
      aria-hidden="true"
      class="absolute left-1/2 -translate-x-1/2 bg-black"
      style="top: {island.y}px; width: {island.w}px; height: {island.h}px; border-radius: {island.h}px"
    ></div>
    <img
      src="/screens/{name}.webp"
      {alt}
      width="780"
      height="1688"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      class="block h-auto w-full"
    />
  </div>
</div>
