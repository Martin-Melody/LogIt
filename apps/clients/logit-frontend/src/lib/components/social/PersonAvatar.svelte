<!-- A round photo or initial, with the green training-now dot when asked. Deleted accounts get
     a plain circle. -->
<script lang="ts">
  const { name, src = null, size = 44, training = false }: { name: string | null; src?: string | null; size?: number; training?: boolean } = $props();
</script>

<span class="relative flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold" style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.38)}px">
  {#if src}<img {src} alt="" class="size-full rounded-full object-cover" />{:else}{(name ?? "").charAt(0).toUpperCase()}{/if}
  {#if training}<span class="absolute bottom-0 right-0 size-3.5 rounded-full border-[3px] border-background bg-success" aria-label="Training now"></span>{/if}
</span>
