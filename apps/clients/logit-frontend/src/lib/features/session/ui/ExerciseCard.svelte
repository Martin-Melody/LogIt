<script lang="ts">
  import { Plus, ChevronDown, ChevronRight, GripVertical, Timer, MoreHorizontal, ArrowDownUp, Undo2, Check } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { Button } from "$lib/components/ui/button";
  import WhySheet from "./WhySheet.svelte";
  import type { BlockStage } from "$lib/features/session/stage";
  import { addButton } from "$lib/components/ui/choice";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import { changeTagClass } from "$lib/features/session/planFormat";
  import type { GripAction } from "$lib/features/session/blocks/types";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { formatLoad } from "@logit/core/domain/units";
  import { reveal, motionOK } from "$lib/transitions";

  const {
    exerciseName = "",
    setCount = 0,
    doneCount = 0,
    saving = false,
    collapsed = false,
    hasActiveTimer = false,
    suggestion = null,
    weightUnit = "kg",
    bodyweight = false,
    grouped = false,
    roundView = false,
    gripAction,
    onAddSet = () => {},
    onOpenDetail = () => {},
    onToggleCollapse = () => {},
    onDismissNudge = () => {},
    onAcceptNudge = () => {},
    lastTime = "",
    chip,
    notice,
    replan = null,
    onToggleReplan = () => {},
    stage,
    summary = "",
    nextTime = null,
    canWarmup = false,
    warmupDisabled = false,
    onAddWarmup = () => {},
    onMenu = () => {},
    onSettings,
    onHowTo,
    children,
  } = $props<{
    exerciseName?: string;
    setCount?: number;
    /** Working sets ticked off so far. */
    doneCount?: number;
    saving?: boolean;
    collapsed?: boolean;
    hasActiveTimer?: boolean;
    suggestion?: ProgressionOutput | null;
    weightUnit?: WeightUnit;
    /** Weights are relative to bodyweight (BW, BW−25, BW+10). */
    bodyweight?: boolean;
    grouped?: boolean;
    /** One round of a group: just the name, menu and that round's set (no grip, collapse, add set or meter). */
    roundView?: boolean;
    gripAction: GripAction;
    onAddSet?: () => void | Promise<void>;
    onOpenDetail?: () => void;
    onToggleCollapse?: () => void;
    onDismissNudge?: (nudgeId: string) => void | Promise<void>;
    onAcceptNudge?: (nudgeId: string) => void | Promise<void>;
    /** "Last time 59 × 10, 10, 9" under the name (design canvas X1). */
    lastTime?: string;
    /** The machine chip (X1): which machine at which place. */
    chip?: import("svelte").Snippet;
    /** A card under the plan, e.g. "Can you add load?" at a place's heaviest weight. */
    notice?: import("svelte").Snippet;
    /** Sets re-planned mid-workout (a short set, the exercise moved): why, and the button that
     * swaps between the re-plan and the original plan. */
    replan?: { text: string; kept: boolean; action: string } | null;
    onToggleReplan?: () => void | Promise<void>;
    /** Where it is in the workout: done and upcoming ones fold to one line (merged design). */
    stage?: BlockStage;
    /** The folded line: what was done ("103 × 8, 8, 6") or what's planned (shown blue). */
    summary?: string;
    /** Folded and done: what happens next time ("+2 kg"). */
    nextTime?: string | null;
    canWarmup?: boolean;
    warmupDisabled?: boolean;
    onAddWarmup?: () => void | Promise<void>;
    /** The exercise menu sheet (swap, superset, warm-ups, rest, machine, order, remove). */
    onMenu?: () => void;
    /** "Change how it plans" in Why this weight?: the exercise's settings. */
    onSettings?: () => void;
    /** Canvas HT2: "How to" beside the name for the first few times; after that it's in the menu. */
    onHowTo?: () => void;
    children?: import("svelte").Snippet;
  }>();

  let whyOpen = $state(false);

  const goal = $derived(suggestion?.progressGoal ?? null);
  const current = $derived(stage === "current");
  const folded = $derived(collapsed && !roundView);
  const allDone = $derived(setCount > 0 && doneCount >= setCount);
  // The reason line, one tap to Why this weight? (was text and an underlined "Why?").
  const reasonText = $derived.by(() => {
    if (!suggestion) return "";
    if (goal) return goal.weight !== undefined ? `${goal.reps} on every set → ${formatLoad(goal.weight, weightUnit, bodyweight)}` : `A set goes up at ${goal.reps} reps`;
    return suggestion.change?.detail ?? suggestion.label ?? "";
  });
</script>

<div class={current ? "" : "border-b border-border/50"}>
<!-- Exercise section header -->
<div class={roundView ? "hidden" : current ? "" : "border-t border-border bg-muted/20"} data-guide="session-exercise-header">
  <!-- Every control here is a 44px target. Swap / superset / remove live in the
       ⋯ menu so the row doesn't need six icons and the name keeps its room. -->
  <div class="flex items-center {roundView ? 'pl-3' : 'pl-1'} pr-1">
    {#if !roundView}
    <!-- Grip handle. Inside a superset / circuit it moves the exercise within the group. -->
    <button
      type="button"
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
      style="touch-action: none"
      use:gripAction
      aria-label={grouped ? "Drag to reorder within the group" : "Drag to reorder"}
      tabindex="-1"
      disabled={saving}
    >
      <GripVertical class="h-4 w-4" />
    </button>

    <!-- Collapse toggle -->
    <button
      type="button"
      class="shrink-0 h-11 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      onclick={onToggleCollapse}
      aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
      disabled={saving}
    >
      {#if collapsed}
        <ChevronRight class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
    </button>
    {/if}

    <button
      type="button"
      class="flex-1 min-w-0 min-h-11 py-1 pl-1 pr-2 text-left"
      onclick={onOpenDetail}
      disabled={saving}
      aria-label="{exerciseName} — open details"
    >
      <span class="block truncate font-semibold {current ? 'text-[17px]' : 'text-[15px]'}">{exerciseName}</span>
      {#if folded && summary}
        <span class="block truncate text-xs font-normal tabular-nums {allDone ? 'text-muted-foreground' : 'text-info'}">{summary}{#if allDone && nextTime} · next time <span class="text-success">{nextTime}</span>{/if}</span>
      {:else if lastTime && !roundView}<span class="block truncate text-xs font-normal text-muted-foreground">{lastTime}</span>{/if}
    </button>

    {#if onHowTo && !folded}
      <button type="button" class="mr-1 h-9 shrink-0 rounded-full border border-border px-3 text-[13px] font-medium" disabled={saving} onclick={onHowTo}>How to</button>
    {/if}
    <span class="flex shrink-0 items-center gap-1 text-xs tabular-nums {allDone ? 'text-success' : 'text-muted-foreground'}">
      {#if allDone}<Check class="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />{/if}
      {#if setCount > 0}{doneCount} of {setCount}{:else}0 sets{/if}
    </span>

    {#if collapsed && hasActiveTimer}
      <span class="shrink-0 ml-2 flex items-center text-primary animate-pulse" aria-label="Rest timer active">
        <Timer class="h-4 w-4" />
      </span>
    {/if}


    <button
      type="button"
      class="shrink-0 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
      disabled={saving}
      aria-label="More actions for {exerciseName}"
      onclick={onMenu}
    >
      <MoreHorizontal class="h-5 w-5" />
    </button>
  </div>

  {#if !collapsed && !roundView && chip}
    <!-- Lined up under the exercise name (past the grip and collapse buttons). -->
    <div class="pb-2 pl-[4.75rem] pr-3">{@render chip()}</div>
  {/if}

  {#if !collapsed && !roundView && suggestion && suggestion.sets.length > 0}
    {#if reasonText || suggestion.change}
      {#if suggestion.reasoning}
        <button type="button" class="mx-3 mb-2 flex min-h-11 w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-border bg-foreground/[0.02] px-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          data-testid="reason-line" aria-label="Why this weight? {suggestion.change?.text ?? ''} {reasonText}" onclick={() => (whyOpen = true)}>
          {#if suggestion.change}<span class={changeTagClass(suggestion.change.kind)}>{suggestion.change.text}</span>{/if}
          <span class="min-w-0 flex-1 [&_b]:font-semibold [&_b]:text-foreground">{reasonText}</span>
          <ChevronRight class="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      {:else}
        <div class="mx-3 mb-2 flex min-h-11 items-center gap-2 text-xs text-muted-foreground" data-testid="reason-line">
          {#if suggestion.change}<span class={changeTagClass(suggestion.change.kind)}>{suggestion.change.text}</span>{/if}
          <span class="min-w-0 flex-1">{reasonText}</span>
        </div>
      {/if}
    {/if}
    {#if suggestion.notes}
      <p class="px-3 pb-1.5 text-xs text-warning -mt-1">{suggestion.notes}</p>
    {/if}
    {#if suggestion.nudge}
      <div class="mx-3 mb-1.5 -mt-1 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 px-2 py-1.5">
        <p class="flex-1 text-xs text-info">{suggestion.nudge.message}</p>
        <div class="flex shrink-0 items-center gap-2">
          {#if suggestion.nudge.actionLabel}
            <button
              type="button"
              class="text-xs font-medium text-info underline underline-offset-2"
              onclick={() => onAcceptNudge(suggestion.nudge!.id)}
            >
              {suggestion.nudge.actionLabel}
            </button>
          {/if}
          <button
            type="button"
            class="text-xs text-info underline underline-offset-2"
            onclick={() => onDismissNudge(suggestion.nudge!.id)}
          >
            {suggestion.nudge.actionLabel ? "Not now" : "Got it"}
          </button>
        </div>
      </div>
    {/if}
  {/if}
  {#if !collapsed && !roundView && replan}
    <div class="mx-3 mb-2.5 flex items-center gap-2" transition:reveal data-testid="replan-line">
      {#if replan.kept}
        <Undo2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {:else}
        <ArrowDownUp class="h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
      {/if}
      {#key replan.text}
        <p class="flex-1 text-xs text-foreground/80" in:fade={{ duration: motionOK() ? 180 : 0 }} aria-live="polite">{replan.text}</p>
      {/key}
      <Button variant="outline" size="sm" class="h-8 shrink-0 px-2.5 text-xs" disabled={saving} onclick={() => void onToggleReplan()}>
        {replan.action}
      </Button>
    </div>
  {/if}
</div>

<!-- Sets -->
{#if !collapsed}
  <div transition:reveal>
    {#if !roundView && notice}{@render notice()}{/if}
    {@render children?.()}
    {#if !roundView && setCount > 0}
      <div class="flex flex-wrap gap-2 px-3 pt-2 pb-3">
        <button type="button" class={addButton} onclick={() => void onAddSet()} disabled={saving}>
          <Plus class="h-3.5 w-3.5" /> Add a set
        </button>
        {#if canWarmup}
          <button type="button" class={addButton} onclick={() => void onAddWarmup()} disabled={saving || warmupDisabled} transition:reveal>
            <Plus class="h-3.5 w-3.5" /> Warm-up ramp
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}
</div>

{#if suggestion?.reasoning}
  <WhySheet
    open={whyOpen}
    onOpenChange={(v) => (whyOpen = v)}
    {exerciseName}
    {suggestion}
    {lastTime}
    {weightUnit}
    {bodyweight}
    {onSettings}
  />
{/if}
