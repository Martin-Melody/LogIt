<script lang="ts">
  import { Check, Plus } from "lucide-svelte";

  // One food in a list: name (+ a small tag), a detail line, and an optional "+" that logs
  // it straight away. The "+" turns into a tick once added.
  interface Props {
    name: string;
    detail: string;
    tag?: string;
    onopen: () => void;
    onadd?: (() => void) | null;
    added?: boolean;
    addLabel?: string;
  }
  const { name, detail, tag, onopen, onadd = null, added = false, addLabel = "Add" }: Props = $props();
</script>

<li class="flex min-h-[62px] items-center gap-1 border-t border-border pl-4 pr-1.5 first:border-t-0">
  <button type="button" class="min-w-0 flex-1 py-2 text-left" onclick={onopen}>
    <span class="block truncate">
      {name}
      {#if tag}<span class="ml-1.5 rounded-[5px] bg-muted px-1.5 py-px align-[1px] text-[10px] font-semibold tracking-wide text-muted-foreground">{tag}</span>{/if}
    </span>
    <span class="block truncate text-xs text-muted-foreground tabular-nums">{detail}</span>
  </button>
  {#if onadd}
    <button
      type="button"
      class="flex size-11 shrink-0 items-center justify-center"
      aria-label={added ? `Added ${name}` : `${addLabel} ${name}`}
      onclick={onadd}
    >
      <span class="flex size-[30px] items-center justify-center rounded-full {added ? 'bg-macro-protein text-background' : 'bg-muted'}">
        {#if added}<Check class="size-4" strokeWidth={3} />{:else}<Plus class="size-4" strokeWidth={2.6} />{/if}
      </span>
    </button>
  {/if}
</li>
