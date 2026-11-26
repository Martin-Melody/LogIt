<!-- Gives one thing (a row, a card, a post) its action list five ways, all from the same
     `actions`: right-click, the ⋯ button, the "." key or Shift+F10 while something inside it has
     focus, a long press on a touchscreen (the browser turns it into a right-click), and ⌘K
     (CommandLayer reads the same builders). The page decides where the ⋯ goes by rendering `more`.

     <ActionMenu {actions} label="More for {name}">
       {#snippet children({ props, more })}
         <li {...props}> … {@render more()} </li>
       {/snippet}
     </ActionMenu> -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { cn } from "$lib/utils";
  import RowMenuItems from "./RowMenuItems.svelte";
  import { isMenuKey, isTyping, type RowAction } from "./commands.svelte";

  let {
    actions,
    label,
    children,
    align = "end",
    menuClass = "w-auto min-w-60",
  }: {
    actions: RowAction[];
    /** The ⋯ button's name, e.g. "More for Aoife". */
    label: string;
    children: Snippet<[{ props: Record<string, unknown>; more: Snippet<[string?]> }]>;
    align?: "start" | "end";
    menuClass?: string;
  } = $props();

  let open = $state(false);

  function onkeydown(e: KeyboardEvent) {
    if (isTyping(e) || !isMenuKey(e)) return;
    // Shift+F10 and the Menu key would also open the right-click menu at the corner of the
    // screen; the ⋯ menu opens next to the thing instead.
    e.preventDefault();
    e.stopPropagation();
    open = true;
  }
</script>

{#snippet more(className?: string)}
  <DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger aria-label={label}
      class={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
        className,
      )}>
      <EllipsisIcon class="size-4" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content {align} class={menuClass}><RowMenuItems {actions} kind="dropdown" /></DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<ContextMenu.Root>
  <ContextMenu.Trigger>
    {#snippet child({ props })}
      {@render children({
        props: { ...props, onkeydown: (e: KeyboardEvent) => { (props.onkeydown as ((e: KeyboardEvent) => void) | undefined)?.(e); onkeydown(e); } },
        more,
      })}
    {/snippet}
  </ContextMenu.Trigger>
  <ContextMenu.Content class={menuClass}><RowMenuItems {actions} kind="context" /></ContextMenu.Content>
</ContextMenu.Root>
