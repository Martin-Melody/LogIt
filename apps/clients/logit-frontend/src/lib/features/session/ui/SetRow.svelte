<script lang="ts">
  import { Check, X } from "lucide-svelte";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, trimWeight, formatLoad } from "@logit/core/domain/units";
  import { setTypeMeta, type SetTarget } from "@logit/core/domain/workout";
  import { formatTargetReps } from "$lib/features/session/planFormat";
  import { effortLabel } from "./effort";
  import { popIn } from "$lib/transitions";

  // One set: "# | Last | weight | reps | tick". The plan sits in the boxes as blue
  // placeholder text until the set is done or something else is typed; ticking an
  // untouched planned set logs the plan. Swipe the row left for edit and delete; edit
  // opens the set's details under it (kind, effort, rest, note). The number is the drag
  // handle for reordering. When Logit knows the real weights (a machine's settings, the plates or
  // dumbbells at your place), tapping the weight opens a picker (X2/X3); otherwise the
  // weight is typed right here.
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
    onPickWeight,
    onRemove,
    optionsOpen = false,
    focusReps = false,
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
    /** Pick the weight from real settings instead of typing (X2/X3). */
    onPickWeight?: () => void;
    /** Editing a past session: the last cell takes the set out instead of ticking it. */
    onRemove?: () => void | Promise<void>;
    /** The set's options are open under the row (S-C). */
    optionsOpen?: boolean;
    /** Put the cursor in reps (a set ticked with nothing entered, or one just added). */
    focusReps?: boolean;
  }>();

  const meta = $derived(setTypeMeta(setType));
  // Warm-ups aren't numbered (setNumber 0): read out as their type instead.
  const setName = $derived(setNumber ? `Set ${setNumber}` : meta.label);
  const shown = (kg: number) => roundDisplayWeight(toDisplayWeight(kg, weightUnit), weightUnit);

  const lastText = $derived(
    prev && prev.reps > 0 ? `${formatLoad(prev.weight, weightUnit, bodyweight, { withUnit: false })} × ${prev.reps}` : "",
  );

  // Still only planned: nothing logged or typed yet.
  const planned = $derived(!!target && !completed && reps === 0);
  // The weight is the plan's until it's changed.
  const weightIsPlan = $derived(planned && Math.abs(weight - (target?.weight ?? 0)) < 0.001);

  const displayWeight = $derived(shown(weight));
  // Re-planned mid-workout and still to do: the old plan shows struck through under the new
  // numbers until the set is started ("Keep the plan" swaps back).
  const was = $derived.by(() => {
    const p = target?.planned;
    if (!weightIsPlan || !p || !target?.replanned) return null;
    return {
      weight: p.weight !== target.weight ? trimWeight(shown(p.weight)) : null,
      reps: p.reps !== target.reps ? String(p.reps) : null,
    };
  });
  // Bodyweight loads show "BW" in the box with the offset typed after it.
  const bwPrefix = $derived(bodyweight ? (displayWeight > 0 ? "BW+" : "BW") : "");

  const weightValue = $derived(
    weightIsPlan ? "" : displayWeight === 0 && (bodyweight || !completed) ? "" : trimWeight(displayWeight),
  );
  const weightPlaceholder = $derived(
    weightIsPlan
      ? displayWeight === 0 ? "" : trimWeight(displayWeight)
      : bodyweight ? "" : prev && prev.weight !== 0 ? trimWeight(shown(prev.weight)) : "",
  );

  const repsValue = $derived(reps > 0 || completed ? String(reps) : "");
  const repsPlaceholder = $derived(
    planned && target ? formatTargetReps(target) : (meta.repsPlaceholder ?? (prev && prev.reps > 0 ? String(prev.reps) : "")),
  );

  let repsEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (focusReps && repsEl) {
      repsEl.focus();
      repsEl.select();
    }
  });

  function num(value: string) {
    // "82,5" from a comma keypad is 82.5.
    const n = Number(value.trim().replace(",", "."));
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
    "h-10 w-full rounded-md border border-border bg-background px-2 text-center text-[15px] font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const planPh = "placeholder:font-medium placeholder:text-info";
  const plainPh = "placeholder:font-normal placeholder:text-muted-foreground";
  // Room under the number for the struck-through old plan, and a blue edge while re-planned.
  const wasBox = "pb-2 border-info/50 transition-colors";
</script>

<div
  class="grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_3.25rem_2.75rem] items-center gap-1.5 px-3 py-0.5 transition-colors {completed
    ? 'bg-muted/40'
    : ''}"
>
  <!-- Set number: hold and drag to reorder. Details open from the swipe's edit button. -->
  <button
    type="button"
    class="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md cursor-grab active:cursor-grabbing transition-colors duration-150 {optionsOpen ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}"
    style="touch-action: none"
    use:gripAction
    aria-label="{setName}, drag to reorder"
    tabindex="-1"
    data-testid="set-number"
    {disabled}
  >
    {#if meta.short}
      <span
        class="text-[11px] font-bold leading-none px-1 py-0.5 rounded-md border tabular-nums {meta.badgeClass}"
        title={meta.label}
      >
        {meta.short}
      </span>
    {:else}
      <span class="text-xs tabular-nums">{setNumber}</span>
    {/if}
    {#if rpe != null}
      <span class="whitespace-nowrap text-[9px] leading-none tabular-nums {optionsOpen ? '' : 'text-muted-foreground'}" title="RPE {rpe}" in:popIn>{effortLabel(rpe)}</span>
    {/if}
  </button>

  <!-- Last time, for this set -->
  <span
    class="h-10 min-w-0 truncate text-left text-[13px] leading-10 tabular-nums text-muted-foreground"
    aria-label={lastText ? `${setName}, last time ${lastText}` : `${setName}, nothing last time`}
    data-testid="set-last"
  >
    {lastText}
  </span>

  <!-- Weight -->
  {#if onPickWeight}
  <div class="relative">
    <button
      type="button"
      class="{box} {was?.weight ? wasBox : ''} {weightValue === '' ? (weightIsPlan ? 'font-medium text-info' : 'font-normal text-muted-foreground') : ''}"
      onclick={onPickWeight}
      {disabled}
      aria-label="{setName} weight: {weightValue || weightPlaceholder || 'not set'} {weightUnit}. Change"
      data-testid="set-weight"
    >
      {weightValue || weightPlaceholder || "–"}
    </button>
    {#if was?.weight}
      <span class="pointer-events-none absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-none text-muted-foreground line-through tabular-nums" transition:popIn aria-hidden="true">{was.weight}</span>
    {/if}
  </div>
  {:else}
  <div class="relative">
    {#if bodyweight}
      <span
        class="pointer-events-none absolute inset-y-0 flex items-center text-[13px] font-semibold
          {weightValue === '' && weightPlaceholder === '' ? 'inset-x-0 justify-center' : 'left-2.5'}
          {weightIsPlan ? 'text-info' : 'text-muted-foreground'}"
        aria-hidden="true"
      >
        {bwPrefix}
      </span>
    {/if}
    <!-- Text + decimal keypad, so "82,5" is 82.5 (a number box dropped the comma: 825). Bodyweight
         sets keep the number box: their minus (assisted) isn't on every decimal keypad. -->
    <input
      class="{box} {was?.weight ? wasBox : ''} {weightIsPlan ? planPh : plainPh} {bodyweight ? (bwPrefix === 'BW+' ? 'pl-[2.6rem] pr-1 text-left' : 'pl-[2.05rem] pr-1 text-left') : ''}"
      type={bodyweight ? "number" : "text"}
      inputmode={bodyweight ? undefined : "decimal"}
      step={weightUnit === "lbs" ? "1" : "0.5"}
      aria-label="{setName} weight ({bodyweight ? `${weightUnit} on top of bodyweight` : weightUnit})"
      placeholder={weightPlaceholder}
      value={weightValue}
      {disabled}
      onfocus={selectAll}
      onkeydown={onWeightKeydown}
      onchange={(e) => void onWeightChange(fromDisplayWeight(num((e.currentTarget as HTMLInputElement).value), weightUnit))}
      data-testid="set-weight"
    />
    {#if was?.weight}
      <span class="pointer-events-none absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-none text-muted-foreground line-through tabular-nums" transition:popIn aria-hidden="true">{was.weight}</span>
    {/if}
  </div>
  {/if}

  <!-- Reps -->
  <div class="relative">
  <input
    bind:this={repsEl}
    class="{box} {was?.reps ? wasBox : ''} {planned ? planPh : plainPh}"
    type="number"
    min="0"
    inputmode="numeric"
    aria-label="{setName} reps"
    placeholder={repsPlaceholder}
    value={repsValue}
    {disabled}
    onfocus={selectAll}
    onkeydown={onRepsKeydown}
    onchange={(e) => void onRepsChange(Math.max(0, num((e.currentTarget as HTMLInputElement).value)))}
    data-testid="set-reps"
  />
  {#if was?.reps}
    <span class="pointer-events-none absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-none text-muted-foreground line-through tabular-nums" transition:popIn aria-hidden="true">{was.reps}</span>
  {/if}
  </div>

  {#if onRemove}
  <button
    type="button"
    class="flex h-11 w-11 items-center justify-center justify-self-center text-muted-foreground hover:text-destructive"
    onclick={() => void onRemove()}
    {disabled}
    aria-label="Remove set {setNumber}"
  >
    <X class="h-4 w-4" />
  </button>
  {:else}
  <button
    type="button"
    data-guide="session-set-complete"
    class="flex h-11 w-11 items-center justify-center justify-self-center"
    onclick={() => void onComplete()}
    {disabled}
    aria-label={completed ? "Mark incomplete" : "Mark complete"}
  >
    <span
      class="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors
        {completed
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-muted-foreground hover:border-primary'}"
    >
      {#if completed}<Check class="h-3 w-3" />{/if}
    </span>
  </button>
  {/if}
</div>
