<script lang="ts">
  import { chip, segment, segmentTrack } from "$lib/components/ui/choice";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import { ChevronDown, ChevronRight, Check, Minus, Plus } from "lucide-svelte";
  import { reveal } from "$lib/transitions";

  import type { SetEntry, SetTarget, SetType } from "@logit/core/domain/workout";
  import type { Machine } from "@logit/core/domain/exercise";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, formatLoad, trimWeight } from "@logit/core/domain/units";
  import { formatTargetReps } from "$lib/features/session/planFormat";
  import { snapToMachine, machineWeightsKg, stepMachineWeight } from "@logit/core/domain/machine";
  import SetTypePicker from "./SetTypePicker.svelte";
  import PlateBreakdown from "./PlateBreakdown.svelte";

  type Editable = Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs" | "machineId" | "rpe">;

  const RPE_OPTIONS = [7, 7.5, 8, 8.5, 9, 9.5, 10];

  const {
    open = false,
    disabled = false,
    initial = null,
    machines = [],
    defaultMachineId = undefined,
    exerciseId = undefined,
    weightUnit = "kg",
    setNumber = null,
    target = null,
    completed = false,
    prev = null,
    bodyweight = false,
    onOpenChange = () => {},
    onSave = async () => {},
    onLog = undefined,
  } = $props<{
    open?: boolean;
    disabled?: boolean;
    initial?: Omit<Editable, "restDurationMs"> & { restDurationMs?: number } | null;
    machines?: Machine[];
    defaultMachineId?: string;
    exerciseId?: string;
    weightUnit?: WeightUnit;
    /** For the title ("Set 2"); drop sets and the like have none. */
    setNumber?: number | null;
    /** What the progression plan has this set down for, if anything. */
    target?: SetTarget | null;
    completed?: boolean;
    /** The same set last time. */
    prev?: { reps: number; weight: number } | null;
    /** Weights are relative to bodyweight: 0 = BW, −25 = assisted, +10 = added. */
    bodyweight?: boolean;
    onOpenChange?: (v: boolean) => void;
    onSave?: (patch: Partial<Editable>) => void | Promise<void>;
    /** Save and tick the set off in one go (offered while it isn't done). */
    onLog?: (patch: Partial<Editable>) => void | Promise<void>;
  }>();

  const load = (kg: number) => formatLoad(kg, weightUnit, bodyweight, { withUnit: !bodyweight });
  const planLine = $derived(
    [
      target && !completed ? `Planned ${formatTargetReps(target)} × ${load(target.weight)}` : null,
      prev && prev.reps > 0 ? `last ${prev.reps} × ${load(prev.weight)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const weightStepSize = $derived(weightUnit === "lbs" ? 5 : 2.5);

  // Use null to represent "empty / not entered" for numeric fields
  const draft = $state<{
    reps: number | null;
    weight: number | null;
    setType: SetType;
    note: string | null;
    restDurationMs: number | undefined;
    machineId: string | null;
    rpe: number | null;
  }>({
    reps: null,
    weight: null,
    setType: "normal",
    note: null,
    restDurationMs: undefined,
    machineId: null,
    rpe: null,
  });

  // What "Log" will record; reps fall back to the plan when left alone.
  const logReps = $derived(draft.reps ?? target?.reps ?? 0);
  const logLabel = $derived(
    `Log ${logReps} × ${draft.weight == null || draft.weight === 0
      ? (bodyweight ? "BW" : `0 ${weightUnit}`)
      : load(fromDisplayWeight(draft.weight, weightUnit))}`,
  );

  let noteExpanded = $state(false);
  let moreOpen = $state(false);
  let lastKey = $state<string | null>(null);

  const activeMachine = $derived(machines.find((m: Machine) => m.id === draft.machineId));
  const machineHasWeights = $derived(!!activeMachine && !!machineWeightsKg(activeMachine));

  /** kg <-> display for the weight input, rounding to the current unit. */
  function toInput(kg: number): number {
    return roundDisplayWeight(toDisplayWeight(kg, weightUnit), weightUnit);
  }

  function pickMachine(id: string) {
    draft.machineId = id;
    const m = machines.find((mm: Machine) => mm.id === id);
    if (m && machineWeightsKg(m) && draft.weight != null) {
      // Snap the entered weight to something this machine can actually be set to.
      draft.weight = toInput(snapToMachine(m, fromDisplayWeight(draft.weight, weightUnit)).kg);
    }
  }

  /** +/- one achievable rung on the selected machine, else one plate increment. */
  function stepWeight(dir: 1 | -1) {
    const currentKg = draft.weight != null ? fromDisplayWeight(draft.weight, weightUnit) : 0;
    if (activeMachine) {
      draft.weight = toInput(stepMachineWeight(activeMachine, currentKg, dir));
      return;
    }
    const next = roundDisplayWeight((draft.weight ?? 0) + dir * weightStepSize, weightUnit);
    // Below zero only means something relative to bodyweight (assistance).
    draft.weight = bodyweight ? next : Math.max(0, next);
  }

  function stepReps(dir: 1 | -1) {
    draft.reps = Math.max(0, (draft.reps ?? target?.reps ?? 0) + dir);
  }

  /** After a free-typed value, snap it to a real rung (weight-list machines only). */
  function snapDraftWeight() {
    if (!activeMachine || !machineWeightsKg(activeMachine) || draft.weight == null) return;
    draft.weight = toInput(
      snapToMachine(activeMachine, fromDisplayWeight(draft.weight, weightUnit)).kg,
    );
  }

  $effect(() => {
    if (!open || !initial) return;
    const key = `${initial.setType}|${initial.reps}|${initial.weight}|${initial.note ?? ""}|${initial.restDurationMs ?? ""}|${initial.machineId ?? ""}|${defaultMachineId ?? ""}|${initial.rpe ?? ""}`;
    if (lastKey === key) return;
    lastKey = key;
    // An untouched planned set starts from the plan, so +/- means "one more than planned".
    draft.reps = initial.reps > 0 ? initial.reps : target && !completed ? target.reps : null;
    // Keep negatives — net assistance on bodyweight / assisted-machine movements.
    // `draft.weight` is in the user's display unit; storage is always kg.
    draft.weight =
      initial.weight !== 0
        ? roundDisplayWeight(toDisplayWeight(initial.weight, weightUnit), weightUnit)
        : null;
    draft.setType = initial.setType ?? "normal";
    draft.note = initial.note ?? null;
    draft.rpe = initial.rpe ?? null;
    draft.restDurationMs = initial.restDurationMs;
    // No machine explicitly logged for this set yet — default to the exercise's
    // usual machine; the user only needs to touch this if they're on a different one.
    draft.machineId = initial.machineId ?? defaultMachineId ?? null;
    noteExpanded = !!initial.note;
    // Auto-open "More" when the set already carries a non-default extra so the
    // user sees it without hunting; otherwise keep the dialog minimal.
    // (restDurationMs is always filled in — it's the effective rest — so it can't
    // be what opens this; that kept the card permanently expanded.)
    moreOpen =
      !!initial.note ||
      (initial.machineId != null && initial.machineId !== (defaultMachineId ?? null));
  });

  function num(v: string, allowNegative = false): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return allowNegative ? n : Math.max(0, n);
  }

  // ── Rest timer ────────────────────────────────────────────────────────────

  const REST_PRESETS = [60_000, 90_000, 120_000, 180_000];
  const STEP_MS = 15_000;
  const MIN_REST_MS = 15_000;
  const MAX_REST_MS = 600_000;

  function formatRest(ms: number): string {
    const totalSecs = Math.round(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}:00`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function selectPreset(ms: number) {
    draft.restDurationMs = ms;
  }

  function clearRest() {
    draft.restDurationMs = undefined;
  }

  function stepRest(delta: number) {
    const current = draft.restDurationMs ?? 90_000;
    draft.restDurationMs = Math.max(MIN_REST_MS, Math.min(MAX_REST_MS, current + delta));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function buildPatch(): Partial<Editable> {
    let weightKg = draft.weight != null ? fromDisplayWeight(draft.weight, weightUnit) : 0;
    if (activeMachine && machineWeightsKg(activeMachine)) {
      weightKg = snapToMachine(activeMachine, weightKg).kg;
    }

    const patch: Partial<Editable> = {
      reps: Math.max(0, draft.reps ?? 0),
      weight: weightKg,
      setType: draft.setType,
      note: draft.note?.trim() || null,
      restDurationMs: draft.restDurationMs,
      machineId: draft.machineId ?? undefined,
      rpe: draft.rpe,
    };
    return patch;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (disabled) return;
    // Saving an untouched planned set keeps it planned (reps stay 0) rather than
    // quietly logging the plan; "Log" is the way to record it.
    const patch = buildPatch();
    if (target && !completed && initial && initial.reps === 0 && draft.reps === target.reps) patch.reps = 0;
    await onSave(patch);
    onOpenChange(false);
  }

  async function logSet() {
    if (disabled || !onLog) return;
    await onLog({ ...buildPatch(), reps: logReps });
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <!-- A bottom sheet on phones: thumbs reach it, and the set list stays in view above. -->
  <Dialog.Content
    class="grid-cols-[minmax(0,1fr)] top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl max-h-[90dvh] overflow-y-auto
      pb-[calc(1.25rem+env(safe-area-inset-bottom))]
      data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100
      data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10
      sm:left-[50%] sm:max-w-[420px] sm:translate-x-[-50%]"
  >
    <form onsubmit={submit}>
      <Dialog.Header class="text-left">
        <Dialog.Title>{setNumber ? `Set ${setNumber}` : "Edit set"}</Dialog.Title>
        {#if planLine}
          <Dialog.Description data-testid="set-card-plan">{planLine}</Dialog.Description>
        {/if}
      </Dialog.Header>

      <div class="flex flex-col gap-4 py-4">

        <!-- Reps -->
        <div class="flex flex-col gap-1.5">
          <Label for="es-reps">Reps</Label>
          <div class="flex items-center gap-3">
            <button type="button" class="h-12 w-12 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40" {disabled} onclick={() => stepReps(-1)} aria-label="One less rep">
              <Minus class="h-5 w-5" />
            </button>
            <input
              id="es-reps"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="—"
              class="h-12 min-w-0 flex-1 rounded-lg border bg-background px-3 text-center text-2xl font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
              value={draft.reps ?? ""}
              {disabled}
              onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
              oninput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                draft.reps = v === "" ? null : num(v);
              }}
            />
            <button type="button" class="h-12 w-12 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40" {disabled} onclick={() => stepReps(1)} aria-label="One more rep">
              <Plus class="h-5 w-5" />
            </button>
          </div>
        </div>

        <!-- Weight -->
        <div class="flex flex-col gap-1.5">
          <Label for="es-weight">
            Weight <span class="text-muted-foreground font-normal">({bodyweight ? `${weightUnit} on top of bodyweight` : weightUnit})</span>
          </Label>
          <div class="flex items-center gap-3">
            <button type="button" class="h-12 w-12 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40" {disabled} onclick={() => stepWeight(-1)} aria-label={bodyweight ? "Less weight (more assistance)" : "Lighter"}>
              <Minus class="h-5 w-5" />
            </button>
            <div class="relative min-w-0 flex-1">
              {#if bodyweight}
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-bold text-muted-foreground" aria-hidden="true">
                  {draft.weight != null && draft.weight > 0 ? "BW+" : "BW"}
                </span>
              {/if}
              <input
                id="es-weight"
                type="number"
                step={weightUnit === "lbs" ? "1" : "0.5"}
                placeholder={bodyweight ? "" : "—"}
                class="h-12 w-full rounded-lg border bg-background px-3 text-center text-2xl font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring {bodyweight ? 'pl-14' : ''}"
                value={draft.weight == null || (bodyweight && draft.weight === 0) ? "" : trimWeight(draft.weight)}
                {disabled}
                onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                oninput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  draft.weight = v === "" ? null : num(v, true);
                }}
                onblur={snapDraftWeight}
              />
            </div>
            <button type="button" class="h-12 w-12 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40" {disabled} onclick={() => stepWeight(1)} aria-label={bodyweight ? "More weight (less assistance)" : "Heavier"}>
              <Plus class="h-5 w-5" />
            </button>
          </div>
          {#if bodyweight}
            <p class="text-xs text-muted-foreground">Below 0 is assistance (BW−25), above 0 is added weight (BW+10).</p>
          {:else if !activeMachine && draft.weight != null && draft.weight > 0}
            <PlateBreakdown weightKg={fromDisplayWeight(draft.weight, weightUnit)} {weightUnit} />
          {/if}
        </div>

        <!-- Set type -->
        <div class="flex flex-col gap-2">
          <Label>Set type</Label>
          <SetTypePicker
            value={draft.setType}
            {disabled}
            onchange={(t) => (draft.setType = t)}
          />
        </div>

        <!-- RPE -->
        <div class="flex flex-col gap-2">
          <Label>RPE <span class="text-muted-foreground font-normal">(optional)</span></Label>
          <div class={segmentTrack}>
            <button
              type="button"
              class={segment(draft.rpe == null)} aria-pressed={draft.rpe == null}
              {disabled}
              onclick={() => (draft.rpe = null)}
            >
              —
            </button>
            {#each RPE_OPTIONS as v (v)}
              <button
                type="button"
                class={segment(draft.rpe === v)} aria-pressed={draft.rpe === v}
                {disabled}
                onclick={() => (draft.rpe = v)}
              >
                {v}
              </button>
            {/each}
          </div>
        </div>

        <!-- More options — machine / rest / note, hidden until needed -->
        <button
          type="button"
          class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-start"
          onclick={() => (moreOpen = !moreOpen)}
        >
          {#if moreOpen}
            <ChevronDown class="h-3.5 w-3.5" />
          {:else}
            <ChevronRight class="h-3.5 w-3.5" />
          {/if}
          More options
        </button>

        {#if moreOpen}
        <div class="flex flex-col gap-4 border-l border-border pl-3" transition:reveal>

        <!-- Machine -->
        {#if machines.length > 0 || exerciseId}
          <div class="flex flex-col gap-2">
            <Label>Machine</Label>
            {#if machines.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each machines as m (m.id)}
                  <button
                    type="button"
                    class={chip(draft.machineId === m.id)} aria-pressed={draft.machineId === m.id}
                    {disabled}
                    onclick={() => pickMachine(m.id)}
                  >
                    {m.name}
                  </button>
                {/each}
              </div>
            {/if}
            {#if machineHasWeights}
              <p class="text-xs text-muted-foreground">
                Weight snaps to {activeMachine?.name}'s settings.
              </p>
            {/if}
            {#if exerciseId}
              <a href="/exercises/{exerciseId}" class="text-xs text-muted-foreground underline hover:text-foreground self-start">
                {machines.length > 0 ? "Edit machines" : "No machines set up for this exercise yet — add one"}
              </a>
            {/if}
          </div>
        {/if}

        <!-- Rest timer -->
        <div class="flex flex-col gap-2">
          <Label>Rest timer</Label>

          <!-- Preset chips -->
          <div class={segmentTrack}>
            <button
              type="button"
              class={segment(draft.restDurationMs === undefined)} aria-pressed={draft.restDurationMs === undefined}
              {disabled}
              onclick={clearRest}
            >
              None
            </button>
            {#each REST_PRESETS as ms (ms)}
              <button
                type="button"
                class={segment(draft.restDurationMs === ms)} aria-pressed={draft.restDurationMs === ms}
                {disabled}
                onclick={() => selectPreset(ms)}
              >
                {formatRest(ms)}
              </button>
            {/each}
          </div>

          <!-- Stepper — only when a time is set -->
          {#if draft.restDurationMs !== undefined}
            <div class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2" transition:reveal>
              <button
                type="button"
                class="h-7 w-7 flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                {disabled}
                onclick={() => stepRest(-STEP_MS)}
              >
                −15s
              </button>
              <span class="text-sm font-semibold tabular-nums">{formatRest(draft.restDurationMs)}</span>
              <button
                type="button"
                class="h-7 w-7 flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                {disabled}
                onclick={() => stepRest(STEP_MS)}
              >
                +15s
              </button>
            </div>
          {/if}
        </div>

        <!-- Note — collapsed until expanded -->
        <div>
          {#if noteExpanded}
            <div class="flex flex-col gap-2" transition:reveal>
              <div class="flex items-center justify-between">
                <Label for="es-note">Note</Label>
                {#if !draft.note?.trim()}
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-foreground"
                    onclick={() => { draft.note = null; noteExpanded = false; }}
                  >
                    Remove
                  </button>
                {/if}
              </div>
              <Textarea
                id="es-note"
                rows={2}
                placeholder="Optional note…"
                {disabled}
                value={draft.note ?? ""}
                oninput={(e) => (draft.note = (e.currentTarget as HTMLTextAreaElement).value)}
              />
            </div>
          {:else}
            <button
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground"
              onclick={() => (noteExpanded = true)}
            >
              + Add note
            </button>
          {/if}
        </div>

        </div>
        {/if}

      </div>

      <div class="flex gap-2">
        {#if onLog && !completed}
          <Button type="submit" variant="outline" class="h-12 flex-1" {disabled}>Save</Button>
          <Button type="button" class="h-12 flex-[2] gap-2" {disabled} onclick={logSet} data-testid="set-card-log">
            <Check class="h-4 w-4" />{logLabel}
          </Button>
        {:else}
          <Dialog.Close class="{buttonVariants({ variant: 'outline' })} h-12 flex-1" {disabled}>Cancel</Dialog.Close>
          <Button type="submit" class="h-12 flex-[2]" {disabled}>Save</Button>
        {/if}
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>
