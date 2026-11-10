<script lang="ts">
  import { Check, GripVertical, Minus, Plus } from "lucide-svelte";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, trimWeight } from "@logit/core/domain/units";
  import { setTypeMeta, type SetTarget } from "@logit/core/domain/workout";
  import { todayCell } from "$lib/features/session/planFormat";

  // One set: "# | Last time | Today | tick". Today shows the plan (blue, dashed)
  // until the set is done; tapping it opens steppers to log something different.
  const {
    setNumber = 1,
    setType = "normal",
    reps = 0,
    weight = 0,
    weightUnit = "kg",
    rpe = null,
    prev = null,
    target = null,
    completed = false,
    editing = false,
    disabled = false,
    gripAction,
    onRepsChange = () => {},
    onWeightChange = () => {},
    onComplete = () => {},
    onToggleEdit = () => {},
  } = $props<{
    setNumber?: number;
    setType?: string;
    reps?: number;
    weight?: number;
    weightUnit?: WeightUnit;
    rpe?: number | null;
    prev?: { reps: number; weight: number } | null;
    target?: SetTarget | null;
    completed?: boolean;
    editing?: boolean;
    disabled?: boolean;
    gripAction: GripAction;
    onRepsChange?: (reps: number) => void | Promise<void>;
    onWeightChange?: (weight: number) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
    onToggleEdit?: () => void;
  }>();

  const meta = $derived(setTypeMeta(setType));
  const shown = (kg: number) => trimWeight(roundDisplayWeight(toDisplayWeight(kg, weightUnit), weightUnit));

  const lastText = $derived(prev && prev.reps > 0 ? `${prev.reps} × ${shown(prev.weight)}` : "");
  const today = $derived(todayCell({ reps, weight, completed, target }, weightUnit));

  // Steppers start from what's planned, so the first "+" on an untouched set
  // means "one more than the plan", not "1 rep".
  const baseReps = $derived(reps > 0 || completed ? reps : (target?.reps ?? 0));
  const displayWeight = $derived(weight === 0 ? 0 : roundDisplayWeight(toDisplayWeight(weight, weightUnit), weightUnit));
  const weightStep = $derived(weightUnit === "lbs" ? 5 : 2.5);

  let repsEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (editing && repsEl && reps === 0 && !target) {
      repsEl.focus();
    }
  });

  function num(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function selectAll(e: FocusEvent) {
    (e.currentTarget as HTMLInputElement).select();
  }

  function blurOnEnter(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  function stepReps(delta: number) {
    void onRepsChange(Math.max(0, baseReps + delta));
  }

  function stepWeight(delta: number) {
    const next = roundDisplayWeight(displayWeight + delta, weightUnit);
    void onWeightChange(fromDisplayWeight(next, weightUnit));
  }

  const stepBtn =
    "h-10 w-10 shrink-0 rounded border border-border bg-background flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40";
  const fieldCls =
    "h-10 w-20 rounded border bg-background px-2 text-center text-base font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring";
</script>

<div class="transition-opacity {completed ? 'opacity-70' : ''}">
  <div class="grid grid-cols-[auto_4.5rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3 py-1">
    <!-- Grip + set number -->
    <button
      type="button"
      class="flex items-center gap-1 pr-1 text-muted-foreground cursor-grab active:cursor-grabbing"
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
        <span class="w-4 text-right text-xs tabular-nums">{setNumber}</span>
      {/if}
      {#if rpe != null}
        <span class="text-[10px] tabular-nums text-muted-foreground" title="RPE {rpe}">@{rpe}</span>
      {/if}
    </button>

    <span class="truncate text-[13px] tabular-nums text-muted-foreground" data-testid="set-last">{lastText}</span>

    <button
      type="button"
      class="h-10 w-full truncate rounded px-2.5 text-left text-[15px] font-semibold tabular-nums transition-colors
        {editing ? 'ring-1 ring-ring' : ''}
        {today.planned
        ? 'border border-dashed border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
        : today.empty
          ? 'border border-border text-muted-foreground font-normal'
          : 'border border-transparent text-foreground'}"
      onclick={onToggleEdit}
      {disabled}
      aria-expanded={editing}
      aria-label="Set {setNumber}: {today.planned ? 'planned ' : ''}{today.text}. Change"
      data-testid="set-today"
    >
      {today.text}
      {#if !today.empty && today.text.includes("×")}<span class="text-xs font-normal opacity-70"> {weightUnit}</span>{/if}
    </button>

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

  {#if editing}
    <div class="mx-3 mb-2 ml-10 flex flex-col gap-2 rounded border border-border p-2.5">
      <div class="flex items-center gap-1.5">
        <span class="w-14 text-xs text-muted-foreground">Reps</span>
        <button type="button" class={stepBtn} onclick={() => stepReps(-1)} {disabled} aria-label="One less rep">
          <Minus class="h-4 w-4" />
        </button>
        <input
          bind:this={repsEl}
          class={fieldCls}
          type="number"
          min="0"
          inputmode="numeric"
          aria-label="Reps"
          placeholder={target ? String(target.reps) : (meta.repsPlaceholder ?? "0")}
          value={reps > 0 || completed ? String(reps) : ""}
          {disabled}
          onfocus={selectAll}
          onkeydown={blurOnEnter}
          onchange={(e) => void onRepsChange(Math.max(0, num((e.currentTarget as HTMLInputElement).value)))}
        />
        <button type="button" class={stepBtn} onclick={() => stepReps(1)} {disabled} aria-label="One more rep">
          <Plus class="h-4 w-4" />
        </button>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-14 text-xs text-muted-foreground">{weightUnit}</span>
        <button type="button" class={stepBtn} onclick={() => stepWeight(-weightStep)} {disabled} aria-label="Less weight">
          <Minus class="h-4 w-4" />
        </button>
        <input
          class={fieldCls}
          type="number"
          step={weightUnit === "lbs" ? "1" : "0.5"}
          inputmode="decimal"
          aria-label="Weight ({weightUnit})"
          value={displayWeight === 0 && !completed ? "" : String(displayWeight)}
          placeholder="0"
          {disabled}
          onfocus={selectAll}
          onkeydown={blurOnEnter}
          onchange={(e) =>
            void onWeightChange(fromDisplayWeight(num((e.currentTarget as HTMLInputElement).value), weightUnit))}
        />
        <button type="button" class={stepBtn} onclick={() => stepWeight(weightStep)} {disabled} aria-label="More weight">
          <Plus class="h-4 w-4" />
        </button>
      </div>
      {#if target && !completed}
        <p class="text-xs text-muted-foreground">
          Planned {target.repsMax !== undefined ? `${target.reps}–${target.repsMax}` : target.reps} × {shown(target.weight)} {weightUnit}. Tick when done.
        </p>
      {/if}
    </div>
  {/if}
</div>
