<script lang="ts">
  import type { Snippet } from "svelte";
  import { registerHeader } from "./AppHeader/headerSlot.svelte";

  // A page's header: the back button, title and buttons go in as children and are drawn
  // in the layout's shared header (above the scrolling page, with the notifications
  // bell). Renders nothing here. The markup stays the page's own, so its state, handlers
  // and bindings work as if it were inline.
  const { children }: { children: Snippet } = $props();

  $effect.pre(() => registerHeader(children));
</script>
