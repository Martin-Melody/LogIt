<script lang="ts">
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
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
  <div class={cn(segmentTrack, "grid h-auto grid-cols-3")}>
    {#each SET_TYPE_META as opt (opt.type)}
      <button
        type="button"
        class={segment(value === opt.type, "h-9")} aria-pressed={value === opt.type}
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
