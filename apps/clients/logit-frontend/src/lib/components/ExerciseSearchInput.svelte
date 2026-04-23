<script lang="ts">
  import type { Exercise } from "$lib/domain/exercise";
  import { getExerciseRepo } from "$lib/data/repoProvider";

  const {
    placeholder = "Search or add exercise…",
    disabled = false,
    autofocus = false,
    onConfirm,
  } = $props<{
    placeholder?: string;
    disabled?: boolean;
    autofocus?: boolean;
    onConfirm: (selection: { name: string; exerciseId?: string }) => void;
  }>();

  let query = $state("");
  let results = $state<Exercise[]>([]);
  let open = $state(false);
  let activeIndex = $state(-1);
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (autofocus) queueMicrotask(() => inputEl?.focus());
  });

  async function search(q: string) {
    if (!q.trim()) { results = []; return; }
    results = await getExerciseRepo().list({ query: q, limit: 8 });
  }

  const showAddNew = $derived(
    query.trim().length > 0 &&
    !results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase()),
  );

  function confirm(name: string, exerciseId?: string) {
    query = name;
    open = false;
    results = [];
    activeIndex = -1;
    onConfirm({ name, exerciseId });
  }

  function selectResult(ex: Exercise) {
    confirm(ex.name, ex.id);
  }

  function confirmNew() {
    const name = query.trim();
    if (name) confirm(name);
  }

  function onInput() {
    open = true;
    activeIndex = -1;
    void search(query);
  }

  function onKeydown(e: KeyboardEvent) {
    const total = results.length + (showAddNew ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, total - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        selectResult(results[activeIndex]!);
      } else if (showAddNew && activeIndex === results.length) {
        confirmNew();
      } else if (query.trim()) {
        confirmNew();
      }
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  function onFocus() {
    if (query.trim()) { open = true; void search(query); }
  }

  function onBlur() {
    setTimeout(() => { open = false; }, 150);
  }

  export function getValue() { return query.trim(); }
  export function clear() { query = ""; results = []; open = false; }
</script>

<div class="relative w-full">
  <input
    bind:this={inputEl}
    class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    type="text"
    {placeholder}
    {disabled}
    bind:value={query}
    oninput={onInput}
    onkeydown={onKeydown}
    onfocus={onFocus}
    onblur={onBlur}
  />

  {#if open && (results.length > 0 || showAddNew)}
    <ul class="absolute z-50 w-full mt-1 rounded-lg border border-border bg-background shadow-lg overflow-hidden max-h-56 overflow-y-auto">
      {#each results as ex, i (ex.id)}
        <li>
          <button
            type="button"
            class="w-full px-3 py-2 text-sm text-left transition-colors {activeIndex === i ? 'bg-muted' : 'hover:bg-muted'}"
            onmousedown={() => selectResult(ex)}
          >
            {ex.name}
          </button>
        </li>
      {/each}

      {#if showAddNew}
        <li class="border-t border-border">
          <button
            type="button"
            class="w-full px-3 py-2 text-sm text-left text-muted-foreground transition-colors {activeIndex === results.length ? 'bg-muted' : 'hover:bg-muted'}"
            onmousedown={confirmNew}
          >
            Add "<span class="text-foreground font-medium">{query.trim()}</span>"
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>
