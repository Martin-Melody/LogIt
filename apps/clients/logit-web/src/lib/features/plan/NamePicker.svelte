<script lang="ts" module>
  export type PickItem = { name: string; detail?: string };
</script>

<script lang="ts">
  /**
   * A search box with a list under it, for adding an exercise, drill or activity by name.
   * Arrow keys move, Enter adds the highlighted one (or what's typed, if `allowNew`), Escape
   * closes. Empty box: nothing listed.
   */
  let {
    id,
    label,
    placeholder = "",
    search,
    onPick,
    onCancel,
    allowNew = true,
    autofocus = false,
  }: {
    id: string;
    label: string;
    placeholder?: string;
    search: (q: string) => PickItem[];
    onPick: (name: string) => void;
    onCancel?: () => void;
    allowNew?: boolean;
    autofocus?: boolean;
  } = $props();

  let query = $state("");
  let active = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  const results = $derived(search(query));
  const typed = $derived(query.trim());
  const showNew = $derived(allowNew && typed.length > 0 && !results.some((r) => r.name.toLowerCase() === typed.toLowerCase()));
  const options = $derived<PickItem[]>([...results, ...(showNew ? [{ name: typed, detail: "add as new" }] : [])]);
  const open = $derived(typed.length > 0);

  $effect(() => {
    if (autofocus) input?.focus();
  });
  $effect(() => {
    // Back to the top whenever the list changes.
    void options.length;
    active = 0;
  });

  function pick(name: string) {
    onPick(name);
    query = "";
    input?.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(options.length - 1, active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) pick(o.name);
    } else if (e.key === "Escape") {
      if (query) query = "";
      else onCancel?.();
    }
  }
</script>

<div class="relative flex w-full flex-col gap-1">
  <label for={id} class="sr-only">{label}</label>
  <input
    {id}
    bind:this={input}
    bind:value={query}
    {placeholder}
    autocomplete="off"
    role="combobox"
    aria-expanded={open}
    aria-controls="{id}-list"
    aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
    onkeydown={onKeydown}
    class="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
  />
  {#if open}
    <div id="{id}-list" role="listbox" aria-label={label}
      class="absolute top-10 z-20 flex w-full flex-col rounded-[10px] border border-border bg-popover p-1 shadow-lg">
      {#each options as o, i (o.name + i)}
        <div
          id="{id}-opt-{i}"
          role="option"
          aria-selected={i === active}
          tabindex="-1"
          onmousedown={(e) => { e.preventDefault(); pick(o.name); }}
          onmouseenter={() => (active = i)}
          class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-[13px] {i === active ? 'bg-muted' : ''}"
        >
          <span class="truncate">{o.name}</span>
          {#if o.detail}<span class="shrink-0 text-xs text-muted-foreground">{o.detail}</span>{/if}
        </div>
      {/each}
      {#if options.length === 0}
        <p class="px-2.5 py-2 text-xs text-muted-foreground">Nothing matches.</p>
      {/if}
      <p class="border-t border-border px-2.5 pt-2 pb-1 text-xs text-muted-foreground">↑ ↓ to move · Enter to add · Esc to close</p>
    </div>
  {/if}
</div>
