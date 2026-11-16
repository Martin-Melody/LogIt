<!-- The strip at the top of Coaching pages while sample clients exist. -->
<script lang="ts">
  import { sandbox } from "./sandbox.svelte";
</script>

{#if sandbox.on}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-info/20 bg-info/10 px-4 py-2 text-sm sm:px-8">
    <span>You have {sandbox.clients.length} sample clients to practise on.</span>
    <a href="/clients#sandbox" class="font-medium underline underline-offset-4">Manage them</a>
  </div>
{/if}
