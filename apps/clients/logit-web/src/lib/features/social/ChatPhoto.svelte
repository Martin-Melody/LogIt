<!-- A photo in a chat (people or coaching): its own shape, click for full size. In a request you
     haven't accepted it's a blurred block until you accept (design canvas M8). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import LockIcon from "@lucide/svelte/icons/lock";
  import ImageOffIcon from "@lucide/svelte/icons/image-off";
  import { photoSrc } from "@logit/core/api/photosApi";

  // bare: inside a bubble with its caption, so the bubble draws the edge.
  const { url, width, height, hidden = false, mine = false, bare = false }: { url: string | null | undefined; width: number; height: number; hidden?: boolean; mine?: boolean; bare?: boolean } = $props();

  let open = $state(false);
  let broken = $state(false);
  const box = $derived.by(() => {
    const w = width || 4, h = height || 5;
    const scale = Math.min(260 / w, 300 / h);
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  });
</script>

{#if hidden}
  <div class="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-muted text-xs font-medium text-muted-foreground {mine ? 'self-end' : 'self-start'}" style="width: {box.w}px; height: {box.h}px">
    <LockIcon class="size-4" />Accept to see it
  </div>
{:else if broken || !url}
  <div class="flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs text-muted-foreground {mine ? 'self-end' : 'self-start'}"><ImageOffIcon class="size-4" />Photo unavailable</div>
{:else}
  <button type="button" aria-label="Open photo" onclick={() => (open = true)}
    class="block shrink-0 overflow-hidden bg-muted {bare ? '' : `rounded-xl border border-border ${mine ? 'self-end' : 'self-start'}`}" style="width: {bare ? Math.max(box.w, 240) : box.w}px; height: {box.h}px">
    <img src={photoSrc(url)} alt="" loading="lazy" class="size-full object-cover" onerror={() => (broken = true)} />
  </button>
  <Dialog.Root bind:open>
    <Dialog.Content class="max-w-[min(92vw,1100px)] border-0 bg-black p-2 text-white sm:max-w-[min(92vw,1100px)]">
      <Dialog.Title class="sr-only">Photo</Dialog.Title>
      <img src={photoSrc(url)} alt="" class="mx-auto max-h-[85vh] max-w-full object-contain" />
    </Dialog.Content>
  </Dialog.Root>
{/if}
