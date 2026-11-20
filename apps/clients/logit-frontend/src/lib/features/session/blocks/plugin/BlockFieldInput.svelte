<script lang="ts">
  // One field of a plugin block, drawn with the app's own controls (design canvas B1). Every
  // control is at least 40px tall: it's used mid-workout.
  import { Minus, Plus } from "lucide-svelte";
  import { chip } from "$lib/components/ui/choice";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { fromDisplayWeight, toDisplayWeight, type WeightUnit } from "@logit/core/domain/units";
  import type { BlockField, BlockValue } from "@logit/core/domain/blockPlugin";
  import { mmss, parseMmss } from "./format";

  let { field, value, options = [], suggestions = [], unit, disabled = false, onchange }: {
    field: BlockField;
    value: BlockValue | undefined;
    /** choice / tags options (a plugin list resolved by the caller). */
    options?: string[];
    /** text: earlier values. */
    suggestions?: string[];
    unit: WeightUnit;
    disabled?: boolean;
    onchange: (v: BlockValue) => void;
  } = $props();

  const id = $derived(`bf-${field.key}-${Math.random().toString(36).slice(2, 7)}`);
  const num = (v: BlockValue | undefined) => (typeof v === "number" ? v : null);
  const inputClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] font-semibold tabular-nums";

  function setNumber(text: string, toStored: (n: number) => number = (n) => n) {
    const t = text.trim().replace(",", ".");
    if (!t) return onchange(null);
    const n = Number(t);
    if (Number.isFinite(n)) onchange(toStored(n));
  }
  const step = $derived(field.step ?? 1);
  const scale = $derived(Array.from({ length: (field.max ?? 5) - (field.min ?? 1) + 1 }, (_, i) => (field.min ?? 1) + i));
  const weightShown = $derived(num(value) == null ? "" : String(Math.round(toDisplayWeight(num(value)!, unit) * 10) / 10));
  const distanceShown = $derived(num(value) == null ? "" : String(unit === "lbs" ? Math.round((num(value)! / 1609.344) * 100) / 100 : Math.round(num(value)! / 10) / 100));
</script>

<div class="flex flex-col gap-1">
  <label for={id} class="text-xs font-semibold text-muted-foreground">{field.label}</label>
  {#if field.type === "counter"}
    <div class="grid grid-cols-[44px_1fr_44px] items-center rounded-lg border border-input" role="group" aria-label={field.label}>
      <button type="button" class="flex h-11 items-center justify-center text-muted-foreground disabled:opacity-40" aria-label="One less: {field.label}"
        disabled={disabled || (num(value) ?? 0) <= (field.min ?? 0)} onclick={() => onchange(Math.max(field.min ?? 0, (num(value) ?? 0) - step))}><Minus class="h-4 w-4" /></button>
      <span {id} class="text-center text-lg font-bold tabular-nums">{num(value) ?? 0}</span>
      <button type="button" class="flex h-11 items-center justify-center disabled:opacity-40" aria-label="One more: {field.label}"
        disabled={disabled || (field.max != null && (num(value) ?? 0) >= field.max)} onclick={() => onchange((num(value) ?? 0) + step)}><Plus class="h-4 w-4" /></button>
    </div>
  {:else if field.type === "scale"}
    <div class="grid gap-1.5" style="grid-template-columns: repeat({scale.length}, minmax(0, 1fr))" role="group" aria-label={field.label}>
      {#each scale as s (s)}
        <button type="button" aria-pressed={value === s} class={chip(value === s, "h-10 rounded-lg px-0")} {disabled} onclick={() => onchange(value === s ? null : s)}>{s}</button>
      {/each}
    </div>
  {:else if field.type === "choice" || field.type === "tags"}
    {@const picked = field.type === "tags" ? (Array.isArray(value) ? value : []) : [value]}
    <div class="flex flex-wrap gap-1.5" role="group" aria-label={field.label}>
      {#each options as o (o)}
        {@const on = picked.includes(o)}
        <button type="button" aria-pressed={on} class={chip(on, "h-10 px-3 text-[13px]")} {disabled}
          onclick={() => onchange(field.type === "tags" ? (on ? picked.filter((x) => x !== o) as string[] : [...(picked as string[]), o]) : on ? null : o)}>{o}</button>
      {/each}
    </div>
  {:else if field.type === "toggle"}
    <Switch checked={value === true} label={field.label} onchange={(v: boolean) => onchange(v)} />
  {:else if field.type === "duration"}
    <input {id} type="text" inputmode="numeric" placeholder="m:ss" class={inputClass} {disabled}
      value={num(value) == null ? "" : mmss(num(value)!)} onchange={(e) => onchange(parseMmss((e.currentTarget as HTMLInputElement).value))} />
  {:else if field.type === "weight"}
    <div class="flex items-center gap-1.5">
      <input {id} type="text" inputmode="decimal" class={inputClass} {disabled} value={weightShown}
        onchange={(e) => setNumber((e.currentTarget as HTMLInputElement).value, (n) => fromDisplayWeight(n, unit))} />
      <span class="text-xs text-muted-foreground">{unit === "lbs" ? "lb" : "kg"}</span>
    </div>
  {:else if field.type === "distance"}
    <div class="flex items-center gap-1.5">
      <input {id} type="text" inputmode="decimal" class={inputClass} {disabled} value={distanceShown}
        onchange={(e) => setNumber((e.currentTarget as HTMLInputElement).value, (n) => (unit === "lbs" ? n * 1609.344 : n * 1000))} />
      <span class="text-xs text-muted-foreground">{unit === "lbs" ? "mi" : "km"}</span>
    </div>
  {:else if field.type === "number"}
    <div class="flex items-center gap-1.5">
      <input {id} type="text" inputmode="decimal" class={inputClass} {disabled} value={num(value) ?? ""}
        onchange={(e) => setNumber((e.currentTarget as HTMLInputElement).value)} />
      {#if field.unit}<span class="text-xs text-muted-foreground">{field.unit}</span>{/if}
    </div>
  {:else if field.multiline}
    <textarea {id} rows="2" class="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-[15px]" {disabled}
      value={typeof value === "string" ? value : ""} onchange={(e) => onchange((e.currentTarget as HTMLTextAreaElement).value.trim() || null)}></textarea>
  {:else}
    <input {id} type="text" list={suggestions.length ? `${id}-list` : undefined} class="{inputClass} font-medium" {disabled}
      value={typeof value === "string" ? value : ""} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).value.trim() || null)} />
    {#if suggestions.length}<datalist id="{id}-list">{#each suggestions as s (s)}<option value={s}></option>{/each}</datalist>{/if}
  {/if}
</div>
