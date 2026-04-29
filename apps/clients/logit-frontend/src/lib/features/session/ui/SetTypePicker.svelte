<script lang="ts">
  import type { SetType } from "$lib/domain/workout";

  const {
    value = "normal",
    disabled = false,
    onchange = () => {},
  } = $props<{
    value?: SetType;
    disabled?: boolean;
    onchange?: (type: SetType) => void;
  }>();

  const options: { type: SetType; label: string }[] = [
    { type: "normal", label: "Normal" },
    { type: "warmup", label: "Warmup" },
    { type: "dropset", label: "Drop" },
    { type: "amrap", label: "AMRAP" },
    { type: "failure", label: "Failure" },
  ];
</script>

<div class="flex gap-1">
  {#each options as opt (opt.type)}
    <button
      type="button"
      class="flex-1 py-1.5 text-xs rounded border transition-colors {value === opt.type
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
      {disabled}
      onclick={() => onchange(opt.type)}
    >
      {opt.label}
    </button>
  {/each}
</div>
