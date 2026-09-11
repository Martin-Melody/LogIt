<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import { reveal } from "$lib/transitions";
  import type { MobilityMetric, MobilitySet, MobilitySide } from "@logit/core/domain/workout";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight } from "@logit/core/domain/units";

  type Patch = Partial<
    Pick<
      MobilitySet,
      "durationSec" | "reps" | "loadKg" | "targetSec" | "depth" | "note" | "restDurationMs" | "leadSide"
    >
  >;

  const {
    open = false,
    disabled = false,
    metric = "hold",
    perSide = false,
    weightUnit = "kg",
    label = null,
    blockLeadSide = "left",
    blockRestMs = undefined,
    initial = null,
    onOpenChange = () => {},
    onSave = async () => {},
  } = $props<{
    open?: boolean;
    disabled?: boolean;
    metric?: MobilityMetric;
    perSide?: boolean;
    weightUnit?: WeightUnit;
    /** "Set 2 · L" etc. — shown in the title. */
    label?: string | null;
    blockLeadSide?: MobilitySide;
    /** Drill-level rest default, ms — the fallback when there's no per-set override. */
    blockRestMs?: number;
    initial?: (Pick<MobilitySet, "durationSec" | "reps" | "loadKg" | "targetSec" | "depth" | "note" | "restDurationMs" | "leadSide" | "side">) | null;
    onOpenChange?: (v: boolean) => void;
    onSave?: (patch: Patch) => void | Promise<void>;
  }>();

  const REST_PRESETS = [30_000, 45_000, 60_000, 90_000];
  const STEP_MS = 15_000;
  const MIN_REST_MS = 15_000;
  const MAX_REST_MS = 600_000;
  const DEPTH_OPTIONS = [1, 2, 3, 4, 5];

  const draft = $state<{
    targetSec: number | null;
    durationSec: number | null;
    reps: number | null;
    load: number | null;
    depth: number | null;
    note: string | null;
    /** undefined = follow the drill default; 0 = explicit "no rest". */
    restDurationMs: number | undefined;
    leadSide: MobilitySide | null;
  }>({
    targetSec: null,
    durationSec: null,
    reps: null,
    load: null,
    depth: null,
    note: null,
    restDurationMs: undefined,
    leadSide: null,
  });

  let noteExpanded = $state(false);
  let lastKey = $state<string | null>(null);

  function toInput(kg: number): number {
    return roundDisplayWeight(toDisplayWeight(kg, weightUnit), weightUnit);
  }

  $effect(() => {
    if (!open || !initial) return;
    const key = JSON.stringify(initial);
    if (lastKey === key) return;
    lastKey = key;
    draft.targetSec = initial.targetSec ?? null;
    draft.durationSec = initial.durationSec && initial.durationSec > 0 ? initial.durationSec : null;
    draft.reps = initial.reps && initial.reps > 0 ? initial.reps : null;
    draft.load = initial.loadKg && initial.loadKg > 0 ? toInput(initial.loadKg) : null;
    draft.depth = initial.depth ?? null;
    draft.note = initial.note ?? null;
    draft.restDurationMs = initial.restDurationMs;
    draft.leadSide = initial.leadSide ?? null;
    noteExpanded = !!initial.note;
  });

  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function formatRest(ms: number): string {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    if (m === 0) return `${s}s`;
    return s % 60 === 0 ? `${m}:00` : `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  function stepRest(delta: number) {
    const current = draft.restDurationMs && draft.restDurationMs > 0 ? draft.restDurationMs : 45_000;
    draft.restDurationMs = Math.max(MIN_REST_MS, Math.min(MAX_REST_MS, current + delta));
  }

  const effectiveLead = $derived(draft.leadSide ?? blockLeadSide);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (disabled) return;
    const patch: Patch = {
      targetSec: draft.targetSec && draft.targetSec > 0 ? Math.round(draft.targetSec) : null,
      durationSec: draft.durationSec && draft.durationSec > 0 ? Math.round(draft.durationSec) : undefined,
      reps: draft.reps && draft.reps > 0 ? Math.round(draft.reps) : undefined,
      loadKg: draft.load && draft.load > 0 ? fromDisplayWeight(draft.load, weightUnit) : undefined,
      depth: draft.depth ?? null,
      note: draft.note?.trim() || null,
      restDurationMs: draft.restDurationMs,
      leadSide: draft.leadSide ?? undefined,
    };
    await onSave(patch);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <!-- Don't auto-focus the first field — it's a numeric input, so autofocus
       pops the keypad the instant the sheet opens, which is jarring rather
       than helpful (unlike AddMobilityDialog's name field, where it's wanted). -->
  <Dialog.Content class="sm:max-w-[380px]" onOpenAutoFocus={(e) => e.preventDefault()}>
    <form onsubmit={submit}>
      <Dialog.Header>
        <Dialog.Title>Edit set{label ? ` · ${label}` : ""}</Dialog.Title>
      </Dialog.Header>

      <div class="flex flex-col gap-4 py-4">
        {#if metric === "hold"}
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-2">
              <Label for="ems-target">Target hold <span class="text-muted-foreground font-normal">(s)</span></Label>
              <input
                id="ems-target"
                type="number" min="0" inputmode="numeric" placeholder="—"
                class="w-full rounded border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                value={draft.targetSec ?? ""}
                {disabled}
                onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                oninput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  draft.targetSec = v === "" ? null : num(v);
                }}
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="ems-dur">Held <span class="text-muted-foreground font-normal">(s)</span></Label>
              <input
                id="ems-dur"
                type="number" min="0" inputmode="numeric" placeholder="—"
                class="w-full rounded border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                value={draft.durationSec ?? ""}
                {disabled}
                onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                oninput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  draft.durationSec = v === "" ? null : num(v);
                }}
              />
            </div>
          </div>
        {:else}
          <div class="flex flex-col gap-2">
            <Label for="ems-reps">Reps</Label>
            <input
              id="ems-reps"
              type="number" min="0" inputmode="numeric" placeholder="—"
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
        {/if}

        <!-- Added load -->
        <div class="flex flex-col gap-2">
          <Label for="ems-load">Added load <span class="text-muted-foreground font-normal">({weightUnit})</span></Label>
          <input
            id="ems-load"
            type="number" min="0" step={weightUnit === "lbs" ? "1" : "0.5"} placeholder="—"
            class="w-full rounded border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            value={draft.load ?? ""}
            {disabled}
            onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
            oninput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              draft.load = v === "" ? null : num(v);
            }}
          />
        </div>

        <!-- Depth -->
        <div class="flex flex-col gap-2">
          <Label>Depth <span class="text-muted-foreground font-normal">(1–5, optional)</span></Label>
          <div class="flex gap-1.5">
            <button
              type="button"
              class="flex-1 py-1.5 text-xs rounded border transition-colors {draft.depth == null
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
              {disabled}
              onclick={() => (draft.depth = null)}
            >
              —
            </button>
            {#each DEPTH_OPTIONS as d (d)}
              <button
                type="button"
                class="flex-1 py-1.5 text-xs rounded border tabular-nums transition-colors {draft.depth === d
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
                {disabled}
                onclick={() => (draft.depth = d)}
              >
                {d}
              </button>
            {/each}
          </div>
        </div>

        <!-- Rest after this set -->
        <div class="flex flex-col gap-2">
          <Label>Rest after this set</Label>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="px-2.5 py-1.5 text-xs rounded border transition-colors {draft.restDurationMs === undefined
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
              {disabled}
              onclick={() => (draft.restDurationMs = undefined)}
            >
              Drill default{blockRestMs && blockRestMs > 0 ? ` (${formatRest(blockRestMs)})` : " (off)"}
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 text-xs rounded border transition-colors {draft.restDurationMs === 0
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
              {disabled}
              onclick={() => (draft.restDurationMs = 0)}
            >
              None
            </button>
            {#each REST_PRESETS as ms (ms)}
              <button
                type="button"
                class="px-2.5 py-1.5 text-xs rounded border tabular-nums transition-colors {draft.restDurationMs === ms
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
                {disabled}
                onclick={() => (draft.restDurationMs = ms)}
              >
                {formatRest(ms)}
              </button>
            {/each}
          </div>
          {#if draft.restDurationMs !== undefined && draft.restDurationMs > 0}
            <div class="flex items-center justify-between gap-2 rounded border border-border px-3 py-2" transition:reveal>
              <button type="button" class="h-7 w-10 flex items-center justify-center rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30" {disabled} onclick={() => stepRest(-STEP_MS)}>−15s</button>
              <span class="text-sm font-semibold tabular-nums">{formatRest(draft.restDurationMs)}</span>
              <button type="button" class="h-7 w-10 flex items-center justify-center rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30" {disabled} onclick={() => stepRest(STEP_MS)}>+15s</button>
            </div>
          {/if}
        </div>

        {#if perSide}
          <div class="flex flex-col gap-2">
            <Label>Which side first</Label>
            <div class="flex gap-1.5">
              {#each [{ v: null, t: `Drill default (${blockLeadSide === "right" ? "R" : "L"})` }, { v: "left", t: "Left" }, { v: "right", t: "Right" }] as opt (opt.t)}
                <button
                  type="button"
                  class="flex-1 py-1.5 text-xs rounded border transition-colors {draft.leadSide === opt.v
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
                  {disabled}
                  onclick={() => (draft.leadSide = opt.v as MobilitySide | null)}
                >
                  {opt.t}
                </button>
              {/each}
            </div>
            <p class="text-xs text-muted-foreground">This set leads with the {effectiveLead} side.</p>
          </div>
        {/if}

        <!-- Note -->
        <div>
          {#if noteExpanded}
            <div class="flex flex-col gap-2" transition:reveal>
              <Label for="ems-note">Note</Label>
              <Textarea
                id="ems-note"
                rows={2}
                placeholder="Optional note…"
                {disabled}
                value={draft.note ?? ""}
                oninput={(e) => (draft.note = (e.currentTarget as HTMLTextAreaElement).value)}
              />
            </div>
          {:else}
            <button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => (noteExpanded = true)}>
              + Add note
            </button>
          {/if}
        </div>
      </div>

      <Dialog.Footer>
        <Dialog.Close class={buttonVariants({ variant: "outline" })} {disabled}>Cancel</Dialog.Close>
        <Button type="submit" {disabled}>Save</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
