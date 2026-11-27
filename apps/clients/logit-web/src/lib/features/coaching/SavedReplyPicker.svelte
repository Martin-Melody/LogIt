<!-- Canvas W10: the saved replies a "/" at the start of a message box points at (or the box's
     button opens). The box calls key(e) from its keydown and stops when it returns true. -->
<script lang="ts">
  import { fillReply, matchReplies, slashQuery, type SavedReply } from "@logit/core/domain/savedReplies";
  import { savedReplies } from "./savedReplies.svelte";

  type Fill = { firstName?: string | null; exercise?: string | null; coachName?: string | null };
  let { draft = $bindable(""), fill, open = $bindable(false) }: { draft?: string; fill: Fill; open?: boolean } = $props();

  let index = $state(0);
  const slash = $derived(slashQuery(draft));
  const matches = $derived(slash !== null || open ? matchReplies(savedReplies.list, slash ?? "").slice(0, 6) : []);
  $effect(() => void savedReplies.load());
  $effect(() => { void slash; index = 0; });

  function use(r: SavedReply) {
    draft = fillReply(r.body, fill);
    open = false;
  }

  /** Arrows, Enter/Tab and Escape while the list is showing. True when it handled the key. */
  export function key(e: KeyboardEvent): boolean {
    if (!matches.length) return false;
    if (e.key === "ArrowDown") index = (index + 1) % matches.length;
    else if (e.key === "ArrowUp") index = (index - 1 + matches.length) % matches.length;
    else if (e.key === "Enter" || e.key === "Tab") use(matches[index]!);
    else if (e.key === "Escape") { open = false; if (slash !== null) draft = ""; }
    else return false;
    e.preventDefault();
    return true;
  }
</script>

{#if matches.length}
  <ul class="flex flex-col rounded-[10px] border border-border bg-popover p-1 shadow-sm" role="listbox" aria-label="Saved replies">
    {#each matches as r, i (r.id)}
      <li role="option" aria-selected={i === index}>
        <!-- Shortcut and title never wrap; the reply's text is the part that gets cut short. -->
        <button type="button" class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 rounded-[7px] px-2.5 py-2 text-left text-[13px] {i === index ? 'bg-muted' : 'hover:bg-muted/60'}" onmousedown={(e) => { e.preventDefault(); use(r); }}>
          <span class="whitespace-nowrap"><b class="font-semibold">/{r.shortcut}</b> <span class="text-muted-foreground">{r.title}</span></span>
          <span class="truncate text-xs text-muted-foreground">{fillReply(r.body, fill)}</span>
        </button>
      </li>
    {/each}
  </ul>
{:else if (slash !== null || open) && savedReplies.loaded}
  <p class="rounded-[10px] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">No saved replies match. Make them in Messages › ⋯ › Saved replies.</p>
{/if}
