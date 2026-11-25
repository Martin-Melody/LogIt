<!-- A group's photo or initials in a rounded square (design canvas G1, M1): squares are groups,
     circles are people. -->
<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";
  const { name, src = null, size = 44 }: { name: string; src?: string | null; size?: number } = $props();
  const initials = $derived(
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?",
  );
</script>

<span class="flex shrink-0 items-center justify-center overflow-hidden bg-muted font-bold" style="width: {size}px; height: {size}px; border-radius: {Math.round(size / 4)}px; font-size: {Math.round(size * 0.36)}px">
  {#if src}<img src={photoSrc(src)} alt="" class="size-full object-cover" />{:else}{initials}{/if}
</span>
