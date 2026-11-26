<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import type { RowAction } from "./commands.svelte";

  // The same items in a row's ⋯ menu and its right-click menu. Each is a link, so
  // ⌘/Ctrl-click or a middle click opens it in a new tab.
  let { actions, kind }: { actions: RowAction[]; kind: "context" | "dropdown" } = $props();
  const Item = $derived(kind === "context" ? ContextMenu.Item : DropdownMenu.Item);
  const Separator = $derived(kind === "context" ? ContextMenu.Separator : DropdownMenu.Separator);
</script>

{#each actions as a (a.id)}
  {#if a.separatorBefore}<Separator />{/if}
  <Item disabled={!!a.disabled} class="min-h-8 gap-4 whitespace-nowrap">
    {#snippet child({ props })}
      <a href={a.href} {...props}>
        <span class="flex-1">{a.label}</span>
        {#if a.disabled}<span class="text-xs text-muted-foreground">{a.disabled}</span>{/if}
      </a>
    {/snippet}
  </Item>
{/each}
