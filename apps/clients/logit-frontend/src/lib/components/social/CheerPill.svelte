<!-- A cheer arriving mid-workout (design canvas T2): under the header for 3 seconds, never over
     the set rows or the rest bar. State and sound in features/friends/cheers.svelte.ts. -->
<script lang="ts">
  import { ThumbsUp } from "lucide-svelte";
  import { fly } from "svelte/transition";
  import { motionOK } from "$lib/transitions";
  import { cheerPill, cheerText } from "$lib/features/friends/cheers.svelte";
</script>

{#if cheerPill.visible}
  <div role="status" transition:fly={{ y: -12, duration: motionOK() ? 200 : 0 }}
    class="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+64px)] z-40 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-accent py-1.5 pl-1.5 pr-4 text-sm">
    <span class="flex size-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">{cheerPill.names[0]?.charAt(0).toUpperCase()}</span>
    <span>{cheerText(cheerPill.names)}</span>
    <ThumbsUp class="size-[18px]" aria-hidden="true" />
  </div>
{/if}
