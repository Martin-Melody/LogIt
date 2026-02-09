<script lang="ts" module>
  export type SetTypePickerOption = {
    id: string;
    code: string;
    label: string;
    subtitle?: string | null;
  };
</script>

<script lang="ts">
  const {
    disabled = false,
    loading = false,
    options = [],
    value,
    onSelect = async (_opt: SetTypePickerOption) => {},
  } = $props<{
    disabled?: boolean;
    loading?: boolean;
    options?: SetTypePickerOption[];
    value: string;
    onSelect?: (opt: SetTypePickerOption) => void | Promise<void>;
  }>();
</script>

<div class="rounded border bg-background">
  {#if loading}
    <div class="p-3 text-sm text-muted-foreground">Loading…</div>
  {:else if options.length === 0}
    <div class="p-3 text-sm text-muted-foreground">No set types.</div>
  {:else}
    <ul class="max-h-64 overflow-auto">
      {#each options as opt (opt.id)}
        <li>
          <button
            type="button"
            class="
              w-full text-left px-3 py-2
              hover:bg-muted/50
              disabled:opacity-50
              {opt.code === value ? 'bg-muted/40' : ''}
            "
            {disabled}
            onclick={() => void onSelect(opt)}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium">{opt.label}</div>
              {#if opt.code === value}
                <span class="text-xs text-muted-foreground">Selected</span>
              {/if}
            </div>

            {#if opt.subtitle}
              <div class="text-xs text-muted-foreground">{opt.subtitle}</div>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
