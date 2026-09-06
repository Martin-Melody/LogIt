<script lang="ts">
  import { Trash2, Star } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import type { Machine, MachineWeights } from "@logit/core/domain/exercise";
  import { machineWeightsKg } from "@logit/core/domain/machine";
  import { toDisplayWeight, trimWeight } from "@logit/core/domain/units";

  const {
    machine,
    isDefault = false,
    saving = false,
    onChange,
    onDelete,
    onMakeDefault,
  } = $props<{
    machine: Machine;
    isDefault?: boolean;
    saving?: boolean;
    onChange: (patch: Partial<Machine>) => void;
    onDelete: () => void;
    onMakeDefault: () => void;
  }>();

  type Mode = "increment" | "linear" | "list";

  // Uncontrolled editor: seed local draft state from the machine once. The parent
  // remounts this (keyed by machine id) if the machine identity changes.
  const seed = machine as Machine;
  const seedLinear = seed.weights?.kind === "linear" ? seed.weights : null;
  const seedStack = seed.weights?.kind === "stack" ? seed.weights : null;

  let name = $state(seed.name);
  let unit = $state<"kg" | "lbs">(seed.unit ?? "kg");
  let mode = $state<Mode>(seedLinear ? "linear" : seedStack ? "list" : "increment");

  let increment = $state(seed.incrementKg);
  let linMin = $state(seedLinear?.min ?? 5);
  let linStep = $state(seedLinear?.step ?? 5);
  let linMax = $state(seedLinear?.max ?? 100);
  let addOnsText = $state((seedLinear?.addOns ?? []).join(", "));
  let listText = $state((seedStack?.values ?? []).join(", "));

  function parseNums(s: string): number[] {
    return s
      .split(/[\s,]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  function buildWeights(): MachineWeights | undefined {
    if (mode === "linear") {
      return {
        kind: "linear",
        min: linMin,
        step: linStep > 0 ? linStep : 1,
        max: linMax >= linMin ? linMax : undefined,
        ...(parseNums(addOnsText).length ? { addOns: parseNums(addOnsText) } : {}),
      };
    }
    if (mode === "list") {
      const values = parseNums(listText);
      return values.length ? { kind: "stack", values } : undefined;
    }
    return undefined;
  }

  /** Best-effort kg increment for the legacy field / simple algorithms. */
  function derivedIncrementKg(w: MachineWeights | undefined): number {
    const toKg = (v: number) => (unit === "lbs" ? v / 2.20462262185 : v);
    if (!w) return increment > 0 ? increment : 2.5;
    if (w.kind === "linear") return round2(toKg(w.step));
    const vals = [...w.values].sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < vals.length; i++) min = Math.min(min, vals[i]! - vals[i - 1]!);
    return round2(toKg(Number.isFinite(min) ? min : (vals[0] ?? 2.5)));
  }

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  function commit() {
    const weights = buildWeights();
    onChange({
      name: name.trim() || machine.name,
      unit,
      weights,
      incrementKg: derivedIncrementKg(weights),
    });
  }

  // Live preview of the achievable weights.
  const previewMachine = $derived<Machine>({
    id: seed.id,
    name: name.trim() || seed.name,
    unit,
    weights: buildWeights(),
    incrementKg: increment,
  });
  const preview = $derived(machineWeightsKg(previewMachine));
  const previewText = $derived.by(() => {
    if (!preview) return null;
    const shown = preview
      .slice(0, 8)
      .map((kg) => trimWeight(Math.round(toDisplayWeight(kg, unit) * 100) / 100));
    return `${preview.length} settings · ${shown.join(", ")}${preview.length > 8 ? " …" : ""}`;
  });
</script>

<div class="flex flex-col gap-3 rounded border border-border px-3 py-3">
  <div class="flex items-center gap-2">
    <input
      type="text"
      class="flex-1 min-w-0 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      bind:value={name}
      onblur={commit}
      disabled={saving}
    />
    <button
      type="button"
      class="shrink-0 p-1 {isDefault ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}"
      aria-label={isDefault ? "Default machine" : "Make default machine"}
      onclick={onMakeDefault}
      disabled={saving}
    >
      <Star class="h-4 w-4" fill={isDefault ? "currentColor" : "none"} />
    </button>
    <ConfirmDialog
      title={`Delete "${machine.name}"?`}
      description="Removes this machine. Sets logged against it keep their history."
      confirmLabel="Delete"
      {saving}
      onConfirm={onDelete}
    >
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="shrink-0 p-1 text-muted-foreground hover:text-destructive"
          aria-label="Delete machine"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      {/snippet}
    </ConfirmDialog>
  </div>

  <!-- Unit -->
  <div class="flex items-center gap-2">
    <span class="text-xs text-muted-foreground w-20">Unit</span>
    <div class="flex gap-1">
      {#each (["kg", "lbs"] as const) as u (u)}
        <button
          type="button"
          class="px-2.5 py-1 text-xs rounded border {unit === u
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border text-muted-foreground hover:text-foreground'}"
          onclick={() => { unit = u; commit(); }}
          disabled={saving}
        >
          {u}
        </button>
      {/each}
    </div>
  </div>

  <!-- Weight model -->
  <div class="flex items-center gap-2">
    <span class="text-xs text-muted-foreground w-20">Weights</span>
    <div class="flex gap-1 flex-wrap">
      {#each ([["increment", "Simple"], ["linear", "Stack"], ["list", "List"]] as [Mode, string][]) as [m, label] (m)}
        <button
          type="button"
          class="px-2.5 py-1 text-xs rounded border {mode === m
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border text-muted-foreground hover:text-foreground'}"
          onclick={() => { mode = m; commit(); }}
          disabled={saving}
        >
          {label}
        </button>
      {/each}
    </div>
  </div>

  {#if mode === "increment"}
    <label class="flex items-center gap-2 text-xs text-muted-foreground">
      <span class="w-20">Increment (kg)</span>
      <input
        type="number" min="0.25" step="0.25"
        class="w-20 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={increment}
        onblur={commit}
        disabled={saving}
      />
    </label>
  {:else if mode === "linear"}
    <div class="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
      <label class="flex flex-col gap-1">Min ({unit})
        <input type="number" min="0" class="rounded border bg-background px-2 py-1 text-sm text-foreground"
          bind:value={linMin} onblur={commit} disabled={saving} />
      </label>
      <label class="flex flex-col gap-1">Step ({unit})
        <input type="number" min="0.25" step="0.25" class="rounded border bg-background px-2 py-1 text-sm text-foreground"
          bind:value={linStep} onblur={commit} disabled={saving} />
      </label>
      <label class="flex flex-col gap-1">Max ({unit})
        <input type="number" min="0" class="rounded border bg-background px-2 py-1 text-sm text-foreground"
          bind:value={linMax} onblur={commit} disabled={saving} />
      </label>
    </div>
    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
      Add-on plates ({unit}, optional) — e.g. 2.5
      <input type="text" class="rounded border bg-background px-2 py-1 text-sm text-foreground"
        bind:value={addOnsText} onblur={commit} disabled={saving} placeholder="2.5" />
    </label>
  {:else}
    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
      Every weight ({unit}), comma separated
      <textarea rows="2" class="rounded border bg-background px-2 py-1 text-sm text-foreground"
        bind:value={listText} onblur={commit} disabled={saving}
        placeholder="5, 10, 15, 20, 30, 40, 50"></textarea>
    </label>
  {/if}

  {#if previewText}
    <p class="text-xs text-muted-foreground tabular-nums">{previewText}</p>
  {/if}
</div>
