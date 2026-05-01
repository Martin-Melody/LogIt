<script lang="ts">
  import { Check, GripVertical } from "lucide-svelte";
  import type { GripAction } from "$lib/features/session/blocks/types";

  const {
    setNumber = 1,
    setType = "normal",
    reps = 0,
    weight = 0,
    completed = false,
    disabled = false,
    gripAction,
    onRepsChange = () => {},
    onWeightChange = () => {},
    onComplete = () => {},
  } = $props<{
    setNumber?: number;
    setType?: string;
    reps?: number;
    weight?: number;
    completed?: boolean;
    disabled?: boolean;
    gripAction: GripAction;
    onRepsChange?: (reps: number) => void | Promise<void>;
    onWeightChange?: (weight: number) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
  }>();

  let repsEl = $state<HTMLInputElement | null>(null);
  let weightEl = $state<HTMLInputElement | null>(null);

  function num(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function selectAll(e: FocusEvent) {
    (e.currentTarget as HTMLInputElement).select();
  }

  function onRepsKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      weightEl?.focus();
      weightEl?.select();
    }
  }

  function onWeightKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  const typeLabel = $derived(() => {
    switch (setType) {
      case "warmup": return "W";
      case "dropset": return "D";
      case "amrap": return "A";
      case "failure": return "F";
      default: return null;
    }
  });

  const repsPlaceholder = $derived(() => {
    if (setType === "amrap") return "Max";
    if (setType === "failure") return "Fail";
    return "0";
  });
</script>

<div
  class="grid grid-cols-[auto_1fr_1fr_2rem] gap-2 items-center px-3 py-1.5 transition-opacity {completed
    ? 'opacity-60'
    : ''}"
>
  <!-- Grip + set number -->
  <button
    type="button"
    class="flex items-center gap-1 text-muted-foreground cursor-grab active:cursor-grabbing pr-1"
    style="touch-action: none"
    use:gripAction
    aria-label="Drag to reorder set"
    tabindex="-1"
    {disabled}
  >
    <GripVertical class="h-3 w-3 shrink-0" />
    <span class="text-xs w-4 text-right tabular-nums">
      {#if typeLabel()}
        <span class="font-semibold text-foreground">{typeLabel()}</span>
      {:else}
        {setNumber}
      {/if}
    </span>
  </button>

  <input
    bind:this={repsEl}
    class="w-full rounded border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
    type="number"
    min="0"
    inputmode="numeric"
    placeholder={repsPlaceholder()}
    value={reps}
    {disabled}
    onfocus={selectAll}
    onkeydown={onRepsKeydown}
    onchange={(e) => void onRepsChange(num((e.currentTarget as HTMLInputElement).value))}
  />

  <input
    bind:this={weightEl}
    class="w-full rounded border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
    type="number"
    min="0"
    step="0.5"
    inputmode="decimal"
    placeholder="0"
    value={weight}
    {disabled}
    onfocus={selectAll}
    onkeydown={onWeightKeydown}
    onchange={(e) => void onWeightChange(num((e.currentTarget as HTMLInputElement).value))}
  />

  <button
    type="button"
    data-tour="session-set-complete"
    class="h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 justify-self-center
      {completed
        ? 'bg-primary border-primary text-primary-foreground'
        : 'border-muted-foreground/40 hover:border-primary'}"
    onclick={() => void onComplete()}
    {disabled}
    aria-label={completed ? "Mark incomplete" : "Mark complete"}
  >
    {#if completed}
      <Check class="h-3 w-3" />
    {/if}
  </button>
</div>
