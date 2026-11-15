<script lang="ts">
  import { initial } from "./format";

  let { name, url = null, size = 32, dim = false }: { name: string; url?: string | null; size?: number; dim?: boolean } = $props();
</script>

{#if url}
  <img src={url} alt="" class="shrink-0 rounded-full object-cover {dim ? 'opacity-60' : ''}" style="width: {size}px; height: {size}px" />
{:else}
  <span aria-hidden="true"
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground {dim ? 'opacity-60' : ''}"
    style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.38)}px">{initial(name)}</span>
{/if}
