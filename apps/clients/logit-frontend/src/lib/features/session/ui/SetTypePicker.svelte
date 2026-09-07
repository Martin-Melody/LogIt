<script lang="ts">
  import type { SetType } from "@logit/core/domain/workout";
  import { SET_TYPE_META, setTypeMeta } from "@logit/core/domain/workout";

  const {
    value = "normal",
    disabled = false,
    onchange = () => {},
  } = $props<{
    value?: SetType;
    disabled?: boolean;
    onchange?: (type: SetType) => void;
  }>();

  const hint = $derived(setTypeMeta(value).hint);
</script>

<div class="flex flex-col gap-1.5">
  <div class="grid grid-cols-3 gap-1.5">
    {#each SET_TYPE_META as opt (opt.type)}
      <button
        type="button"
        class="py-1.5 text-xs rounded border transition-colors {value === opt.type
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
        {disabled}
        onclick={() => onchange(opt.type as SetType)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
  {#if hint}
    <p class="text-xs text-muted-foreground">{hint}</p>
  {/if}
</div>
