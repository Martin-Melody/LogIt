<!-- One Settings page: the shared header (back to Settings) and the page's sections. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";

  const { title, children }: { title: string; children: Snippet } = $props();
</script>

<PageHeader>
  <BackButton onclick={() => back("/settings")} />
  <h1 class="page-title">{title}</h1>
</PageHeader>

<div class="flex flex-col gap-6 p-3 pb-24 lg:px-0 lg:pt-4">
  {@render children()}
</div>
