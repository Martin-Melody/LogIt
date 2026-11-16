<!-- "What you can and can't do" for one or more features. -->
<script lang="ts">
  import { feature } from "./guide";
  let { ids }: { ids: string[] } = $props();
  const can = $derived(ids.flatMap((i) => feature(i).can ?? []));
  const cant = $derived(ids.flatMap((i) => feature(i).cant ?? []));
</script>

{#if can.length || cant.length}
  <div class="not-prose my-6 grid gap-3 sm:grid-cols-2">
    {#if can.length}
      <div class="rounded-xl border border-border bg-card p-4">
        <h3 class="mb-2 text-[15px] font-bold text-foreground">You can</h3>
        <ul class="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">{#each can as c (c)}<li>{c}</li>{/each}</ul>
      </div>
    {/if}
    {#if cant.length}
      <div class="rounded-xl border border-border bg-card p-4">
        <h3 class="mb-2 text-[15px] font-bold text-foreground">You can't</h3>
        <ul class="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">{#each cant as c (c)}<li>{c}</li>{/each}</ul>
      </div>
    {/if}
  </div>
{/if}
