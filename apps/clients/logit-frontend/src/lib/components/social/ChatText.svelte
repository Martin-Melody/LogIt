<!-- A message's text. Long ones fold after 6 lines with "Show more" (canvas board 17). -->
<script lang="ts">
  let { text, fold = true }: { text: string; fold?: boolean } = $props();
  let open = $state(false);
  let long = $state(false);
  let el = $state<HTMLElement | null>(null);
  $effect(() => {
    void text;
    if (el && fold && !open) long = el.scrollHeight > el.clientHeight + 1;
  });
</script>

<span bind:this={el} class="whitespace-pre-wrap break-words {fold && !open ? 'line-clamp-6' : 'block'}">{text}</span>
{#if long}
  <button type="button" class="-mx-1 mt-0.5 min-h-8 px-1 text-left font-semibold" onclick={(e) => { e.stopPropagation(); open = !open; }}>{open ? "Show less" : "Show more"}</button>
{/if}
