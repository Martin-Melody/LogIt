<script lang="ts" module>
  export type ExerciseOption = {
    id: string;
    name: string;
    subtitle?: string | null;
  };
</script>

<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  const {
    disabled = false,
    loading = false,
    options = [],
    onSearch = async (_q: string) => {},
    onSelect = async (_opt: ExerciseOption) => {},
    placeholder = "Search exercises…",
    minChars = 2,
  } = $props<{
    disabled?: boolean;
    loading?: boolean;
    options?: ExerciseOption[];
    onSearch?: (q: string) => void | Promise<void>;
    onSelect?: (opt: ExerciseOption) => void | Promise<void>;
    placeholder?: string;
    minChars?: number;
  }>();

  let q = $state("");
  let lastQ = $state("");

  async function handleInput(v: string) {
    q = v;

    const next = q.trim();

    if (next.length < minChars) {
      lastQ = "";
      await onSearch("");
      return;
    }

    if (next === lastQ) return;
    lastQ = next;

    await onSearch(next);
  }
  function clear() {
    q = "";
    lastQ = "";
    void onSearch("");
  }
</script>

<div class="grid gap-3">
  <div class="flex items-center gap-2">
    <Input
      bind:value={q}
      {disabled}
      {placeholder}
      oninput={() => void handleInput(q)}
    />
    <Button
      type="button"
      variant="outline"
      disabled={disabled || !q}
      onclick={clear}
    >
      Clear
    </Button>
  </div>

  <div class="rounded border bg-background">
    {#if q.trim().length < minChars}
      <!-- optional hint -->
      {#if q.trim().length > 0}
        <div class="p-3 text-sm text-muted-foreground">
          Type at least {minChars} characters to search.
        </div>
      {/if}
    {:else if loading}
      <div class="p-3 text-sm text-muted-foreground">Loading…</div>
    {:else if options.length === 0}
      <div class="p-3 text-sm text-muted-foreground">
        No results for “{q.trim()}”.
      </div>
    {:else}
      <ul class="max-h-64 overflow-auto">
        {#each options as opt (opt.id)}
          <li>
            <button
              type="button"
              class="w-full text-left px-3 py-2 hover:bg-muted/50 disabled:opacity-50"
              {disabled}
              onclick={() => void onSelect(opt)}
            >
              <div class="text-sm font-medium">{opt.name}</div>
              {#if opt.subtitle}
                <div class="text-xs text-muted-foreground">{opt.subtitle}</div>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
