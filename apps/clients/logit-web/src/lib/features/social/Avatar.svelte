<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";
  let { name, url = null, size = 36 }: { name: string; url?: string | null; size?: number } = $props();
</script>

{#if url}
  <img src={photoSrc(url)} alt="" width={size} height={size} class="shrink-0 rounded-full object-cover" style="width: {size}px; height: {size}px" />
{:else}
  <span aria-hidden="true" class="inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold"
    style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.38)}px">{(name || "?").slice(0, 1).toUpperCase()}</span>
{/if}
