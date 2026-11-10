<script lang="ts">
  import { Check } from "lucide-svelte";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, trimWeight, formatLoad } from "@logit/core/domain/units";
  import { setTypeMeta, type SetTarget } from "@logit/core/domain/workout";
  import { formatTargetReps } from "$lib/features/session/planFormat";

  // One set: "# | Last | weight | reps | tick". The plan sits in the boxes as blue
  // placeholder text until the set is done or something else is typed; ticking an
  // untouched planned set logs the plan. The rest (type, RPE, note, rest, machine)
  // lives in the set card, opened from the "Last" cell or by swiping.
  const {
    setNumber = 1,
    setType = "normal",
    reps = 0,
    weight = 0,
    weightUnit = "kg",
    bodyweight = false,
    rpe = null,
    prev = null,
    target = null,
    completed = false,
    disabled = false,
    gripAction,
    onRepsChange = () => {},
    onWeightChange = () => {},
    onComplete = () => {},
    onOpenDetails = () => {},
  } = $props<{
    setNumber?: number;
    setType?: string;
    reps?: number;
    weight?: number;
    weightUnit?: WeightUnit;
    /** Weights are relative to bodyweight: 0 = BW, −25 = assisted, +10 = added. */
    bodyweight?: boolean;
    rpe?: number | null;
    prev?: { reps: number; weight: number } | null;
    target?: SetTarget | null;
    completed?: boolean;
    disabled?: boolean;
    gripAction: GripAction;
    onRepsChange?: (reps: number) => void | Promise<void>;
    onWeightChange?: (weight: number) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
    onOpenDetails?: () => void;
  }>();

  const meta = $derived(setTypeMeta(setType));
  const shown = (kg: number) => roundDisplayWeight(toDisplayWeight(kg, weightUnit), weightUnit);

  const lastText = $derived(
    prev && prev.reps > 0 ? `${prev.reps} × ${formatLoad(prev.weight, weightUnit, bodyweight, { withUnit: false })}` : "",
  );

  // Still only planned: nothing logged or typed yet.
  const planned = $derived(!!target && !completed && reps === 0);
  // The weight is the plan's until it's changed.
  const weightIsPlan = $derived(planned && Math.abs(weight - (target?.weight ?? 0)) < 0.001);

  const displayWeight = $derived(shown(weight));
  // Bodyweight loads show "BW" in the box with the offset typed after it.
  const bwPrefix = $derived(bodyweight ? (displayWeight > 0 ? "BW+" : "BW") : "");

  const weightValue = $derived(
    weightIsPlan ? "" : displayWeight === 0 && (bodyweight || !completed) ? "" : trimWeight(displayWeight),
  );
  const weightPlaceholder = $derived(
    weightIsPlan
      ? displayWeight === 0 ? (bodyweight ? "" : "0") : trimWeight(displayWeight)
      : bodyweight ? "" : prev && prev.weight !== 0 ? trimWeight(shown(prev.weight)) : "0",
  );

  const repsValue = $derived(reps > 0 || completed ? String(reps) : "");
  const repsPlaceholder = $derived(
    planned && target ? formatTargetReps(target) : (meta.repsPlaceholder ?? (prev && prev.reps > 0 ? String(prev.reps) : "")),
  );

  let repsEl = $state<HTMLInputElement | null>(null);

  function num(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function selectAll(e: FocusEvent) {
    (e.currentTarget as HTMLInputElement).select();
  }

  function onWeightKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      repsEl?.focus();
      repsEl?.select();
    }
  }

  function onRepsKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  const box =
    "h-9 w-full rounded border border-border bg-background px-2 text-center text-[15px] font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const planPh = "placeholder:font-medium placeholder:text-blue-600 dark:placeholder:text-blue-300";
  const plainPh = "placeholder:font-normal placeholder:text-muted-foreground/60";
</script>

<div
  class="grid grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_3.25rem_2.75rem] items-center gap-1.5 px-3 py-1 transition-opacity {completed
    ? 'opacity-70'
    : ''}"
>
  <!-- Set number; also the drag handle (no grip icon: it cost every row width) -->
  <button
    type="button"
    class="flex h-9 flex-col items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing"
    style="touch-action: none"
    use:gripAction
    aria-label="Drag to reorder set"
    tabindex="-1"
    {disabled}
  >
    {#if meta.short}
      <span
        class="text-[10px] font-bold leading-none px-1 py-0.5 rounded border tabular-nums {meta.badgeClass}"
        title={meta.label}
      >
        {meta.short}
      </span>
    {:else}
      <span class="text-xs tabular-nums">{setNumber}</span>
    {/if}
    {#if rpe != null}
      <span class="text-[9px] leading-none tabular-nums text-muted-foreground" title="RPE {rpe}">@{rpe}</span>
    {/if}
  </button>

  <!-- Last time; also the way into the set card -->
  <button
    type="button"
    class="h-9 min-w-0 truncate text-left text-[13px] tabular-nums text-muted-foreground"
    onclick={onOpenDetails}
    {disabled}
    aria-label="Set {setNumber} details{lastText ? `, last time ${lastText}` : ''}"
    data-testid="set-last"
  >
    {lastText || "–"}
  </button>

  <!-- Weight -->
  <div class="relative">
    {#if bodyweight}
      <span
        class="pointer-events-none absolute inset-y-0 flex items-center text-[13px] font-semibold
          {weightValue === '' && weightPlaceholder === '' ? 'inset-x-0 justify-center' : 'left-2.5'}
          {weightIsPlan ? 'text-blue-600 dark:text-blue-300' : 'text-muted-foreground'}"
        aria-hidden="true"
      >
        {bwPrefix}
      </span>
    {/if}
    <input
      class="{box} {weightIsPlan ? planPh : plainPh} {bodyweight ? (bwPrefix === 'BW+' ? 'pl-[2.6rem] pr-1 text-left' : 'pl-[2.05rem] pr-1 text-left') : ''}"
      type="number"
      step={weightUnit === "lbs" ? "1" : "0.5"}
      aria-label="Set {setNumber} weight ({bodyweight ? `${weightUnit} on top of bodyweight` : weightUnit})"
      placeholder={weightPlaceholder}
      value={weightValue}
      {disabled}
      onfocus={selectAll}
      onkeydown={onWeightKeydown}
      onchange={(e) => void onWeightChange(fromDisplayWeight(num((e.currentTarget as HTMLInputElement).value), weightUnit))}
      data-testid="set-weight"
    />
  </div>

  <!-- Reps -->
  <input
    bind:this={repsEl}
    class="{box} {planned ? planPh : plainPh}"
    type="number"
    min="0"
    inputmode="numeric"
    aria-label="Set {setNumber} reps"
    placeholder={repsPlaceholder}
    value={repsValue}
    {disabled}
    onfocus={selectAll}
    onkeydown={onRepsKeydown}
    onchange={(e) => void onRepsChange(Math.max(0, num((e.currentTarget as HTMLInputElement).value)))}
    data-testid="set-reps"
  />

  <button
    type="button"
    data-tour="session-set-complete"
    class="flex h-11 w-11 items-center justify-center justify-self-center"
    onclick={() => void onComplete()}
    {disabled}
    aria-label={completed ? "Mark incomplete" : "Mark complete"}
  >
    <span
      class="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors
        {completed
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-muted-foreground/40 hover:border-primary'}"
    >
      {#if completed}<Check class="h-3 w-3" />{/if}
    </span>
  </button>
</div>
