<!-- The band across Coaching pages in Practice view (canvas V1): only sample clients are shown,
     and nothing done here reaches a real person. Striped slate, because amber and blue already
     mean record or warning, and planned. Someone trying Studio can't turn it off: their only
     clients are the samples. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { practice, sandbox } from "./sandbox.svelte";
</script>

{#if practice.on}
  <div role="status"
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-slate-900 bg-slate-800 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.05)_0_10px,transparent_10px_20px)] px-4 py-2 text-sm text-white sm:px-8">
    {#if practice.locked}
      <span>Trying Studio with sample clients. Everything you build here is kept when you get Studio.</span>
      <Button href="/upgrade" variant="outline" size="sm" class="h-7 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">Get Studio</Button>
    {:else}
      <span><strong class="font-semibold">Practice view</strong> · only your {sandbox.clients.length} sample clients. Real clients, requests and messages are hidden, and nothing you do here reaches them.</span>
      <Button variant="outline" size="sm" class="h-7 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white" onclick={() => practice.set(false)}>Turn off</Button>
    {/if}
  </div>
{/if}
