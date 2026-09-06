<script lang="ts">
  import { Check, GripVertical } from "lucide-svelte";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, trimWeight } from "@logit/core/domain/units";
  import { setTypeMeta } from "@logit/core/domain/workout";

  const {
    setNumber = 1,
    setType = "normal",
    reps = 0,
    weight = 0,
    weightUnit = "kg",
    rpe = null,
    prev = null,
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
    weightUnit?: WeightUnit;
    rpe?: number | null;
    prev?: { reps: number; weight: number } | null;
    completed?: boolean;
    disabled?: boolean;
    gripAction: GripAction;
    onRepsChange?: (reps: number) => void | Promise<void>;
    onWeightChange?: (weight: number) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
  }>();

  // Weight is stored in kg; show it in the user's unit and convert edits back.
  const displayWeight = $derived(
    weight === 0 ? 0 : roundDisplayWeight(toDisplayWeight(weight, weightUnit), weightUnit),
  );

  // "Last time" ghost values, shown as input placeholders on an untouched set.
  const prevReps = $derived(prev && prev.reps > 0 ? String(prev.reps) : null);
  const prevWeight = $derived(
    prev && prev.weight !== 0
      ? trimWeight(roundDisplayWeight(toDisplayWeight(prev.weight, weightUnit), weightUnit))
      : null,
  );
  const repsValue = $derived(reps === 0 && !completed ? "" : String(reps));
  const weightValue = $derived(displayWeight === 0 && !completed ? "" : String(displayWeight));

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

  const meta = $derived(setTypeMeta(setType));
  const repsPlaceholder = $derived(meta.repsPlaceholder ?? "0");
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
    {#if meta.short}
      <span
        class="text-[10px] font-bold leading-none px-1 py-0.5 rounded border tabular-nums {meta.badgeClass}"
        title={meta.label}
      >
        {meta.short}
      </span>
    {:else}
      <span class="text-xs w-4 text-right tabular-nums">{setNumber}</span>
    {/if}
    {#if rpe != null}
      <span class="text-[10px] text-muted-foreground tabular-nums" title="RPE {rpe}">@{rpe}</span>
    {/if}
  </button>

  <input
    bind:this={repsEl}
    class="w-full rounded border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
    type="number"
    min="0"
    inputmode="numeric"
    placeholder={prevReps ?? repsPlaceholder}
    value={repsValue}
    {disabled}
    onfocus={selectAll}
    onkeydown={onRepsKeydown}
    onchange={(e) => void onRepsChange(num((e.currentTarget as HTMLInputElement).value))}
  />

  <input
    bind:this={weightEl}
    class="w-full rounded border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
    type="number"
    step={weightUnit === "lbs" ? "1" : "0.5"}
    placeholder={prevWeight ?? "0"}
    value={weightValue}
    {disabled}
    onfocus={selectAll}
    onkeydown={onWeightKeydown}
    onchange={(e) =>
      void onWeightChange(
        fromDisplayWeight(num((e.currentTarget as HTMLInputElement).value), weightUnit),
      )}
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
