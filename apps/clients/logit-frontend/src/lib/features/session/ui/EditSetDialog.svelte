<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  import type { SetEntry, SetType } from "@logit/core/domain/workout";
  import type { Machine } from "@logit/core/domain/exercise";
  import SetTypePicker from "./SetTypePicker.svelte";

  type Editable = Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs" | "machineId">;

  const {
    open = false,
    disabled = false,
    initial = null,
    machines = [],
    defaultMachineId = undefined,
    exerciseId = undefined,
    onOpenChange = () => {},
    onSave = async () => {},
  } = $props<{
    open?: boolean;
    disabled?: boolean;
    initial?: Omit<Editable, "restDurationMs"> & { restDurationMs?: number } | null;
    machines?: Machine[];
    defaultMachineId?: string;
    exerciseId?: string;
    onOpenChange?: (v: boolean) => void;
    onSave?: (patch: Partial<Editable>) => void | Promise<void>;
  }>();

  // Use null to represent "empty / not entered" for numeric fields
  const draft = $state<{
    reps: number | null;
    weight: number | null;
    setType: SetType;
    note: string | null;
    restDurationMs: number | undefined;
    machineId: string | null;
  }>({
    reps: null,
    weight: null,
    setType: "normal",
    note: null,
    restDurationMs: undefined,
    machineId: null,
  });

  let noteExpanded = $state(false);
  let lastKey = $state<string | null>(null);

  $effect(() => {
    if (!open || !initial) return;
    const key = `${initial.setType}|${initial.reps}|${initial.weight}|${initial.note ?? ""}|${initial.restDurationMs ?? ""}|${initial.machineId ?? ""}|${defaultMachineId ?? ""}`;
    if (lastKey === key) return;
    lastKey = key;
    draft.reps = initial.reps > 0 ? initial.reps : null;
    draft.weight = initial.weight > 0 ? initial.weight : null;
    draft.setType = initial.setType ?? "normal";
    draft.note = initial.note ?? null;
    draft.restDurationMs = initial.restDurationMs;
    // No machine explicitly logged for this set yet — default to the exercise's
    // usual machine; the user only needs to touch this if they're on a different one.
    draft.machineId = initial.machineId ?? defaultMachineId ?? null;
    noteExpanded = !!initial.note;
  });

  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
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

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (disabled) return;

    const patch: Partial<Editable> = {
      reps: Math.max(0, draft.reps ?? 0),
      weight: Math.max(0, draft.weight ?? 0),
      setType: draft.setType,
      note: draft.note?.trim() || null,
      restDurationMs: draft.restDurationMs,
      machineId: draft.machineId ?? undefined,
    };

    await onSave(patch);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[380px]">
    <form onsubmit={submit}>
      <Dialog.Header>
        <Dialog.Title>Edit set</Dialog.Title>
      </Dialog.Header>

      <div class="flex flex-col gap-5 py-4">

        <!-- Set type -->
        <div class="flex flex-col gap-2">
          <Label>Set type</Label>
          <SetTypePicker
            value={draft.setType}
            {disabled}
            onchange={(t) => (draft.setType = t)}
          />
        </div>

        <!-- Machine -->
        {#if machines.length > 0 || exerciseId}
          <div class="flex flex-col gap-2">
            <Label>Machine</Label>
            {#if machines.length > 0}
              <div class="flex gap-1.5 flex-wrap">
                {#each machines as m (m.id)}
                  <button
                    type="button"
                    class="px-2.5 py-1.5 text-xs rounded border transition-colors {draft.machineId === m.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
                    {disabled}
                    onclick={() => (draft.machineId = m.id)}
                  >
                    {m.name}
                  </button>
                {/each}
              </div>
            {/if}
            {#if exerciseId}
              <a href="/exercises/{exerciseId}" class="text-xs text-muted-foreground underline hover:text-foreground self-start">
                {machines.length > 0 ? "Add another machine" : "No machines set up for this exercise yet — add one"}
              </a>
            {/if}
          </div>
        {/if}

        <!-- Reps + Weight -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <Label for="es-reps">Reps</Label>
            <input
              id="es-reps"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="—"
              class="w-full rounded border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
              value={draft.reps ?? ""}
              {disabled}
              onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
              oninput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                draft.reps = v === "" ? null : num(v);
              }}
            />
          </div>

          <div class="flex flex-col gap-2">
            <Label for="es-weight">Weight <span class="text-muted-foreground font-normal">(kg)</span></Label>
            <input
              id="es-weight"
              type="number"
              min="0"
              step="0.5"
              inputmode="decimal"
              placeholder="—"
              class="w-full rounded border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
              value={draft.weight ?? ""}
              {disabled}
              onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
              oninput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                draft.weight = v === "" ? null : num(v);
              }}
            />
          </div>
        </div>

        <!-- Rest timer -->
        <div class="flex flex-col gap-2">
          <Label>Rest timer</Label>

          <!-- Preset chips -->
          <div class="flex gap-1.5">
            <button
              type="button"
              class="flex-1 py-1.5 text-xs rounded border transition-colors {draft.restDurationMs === undefined
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
              {disabled}
              onclick={clearRest}
            >
              None
            </button>
            {#each REST_PRESETS as ms (ms)}
              <button
                type="button"
                class="flex-1 py-1.5 text-xs rounded border transition-colors {draft.restDurationMs === ms
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
                {disabled}
                onclick={() => selectPreset(ms)}
              >
                {formatRest(ms)}
              </button>
            {/each}
          </div>

          <!-- Stepper — only when a time is set -->
          {#if draft.restDurationMs !== undefined}
            <div class="flex items-center justify-between gap-2 rounded border border-border px-3 py-2">
              <button
                type="button"
                class="h-7 w-7 flex items-center justify-center rounded text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                {disabled}
                onclick={() => stepRest(-STEP_MS)}
              >
                −15s
              </button>
              <span class="text-sm font-semibold tabular-nums">{formatRest(draft.restDurationMs)}</span>
              <button
                type="button"
                class="h-7 w-7 flex items-center justify-center rounded text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
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
            <div class="flex flex-col gap-2">
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

      <Dialog.Footer>
        <Dialog.Close class={buttonVariants({ variant: "outline" })} {disabled}>
          Cancel
        </Dialog.Close>
        <Button type="submit" {disabled}>Save</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
