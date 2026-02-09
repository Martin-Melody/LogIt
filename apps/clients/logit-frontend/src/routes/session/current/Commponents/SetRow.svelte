<script lang="ts">
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import { GripVertical } from "lucide-svelte";

  export let setType: number;
  export let reps = 0;
  export let weight = 0;
  export let disabled = false;

  export let completed = false;
  export let onCompletedChange: (v: boolean) => void | Promise<void> = () => {};

  export let onRepsChange: (reps: number) => void | Promise<void> = () => {};
  export let onWeightChange: (
    weight: number,
  ) => void | Promise<void> = () => {};

  function num(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
</script>

<div
  class="
    grid items-center justify-items-center gap-x-2
    rounded-md pr-1 transition-colors
    {completed ? 'bg-[#EAF8F0]' : ''}

    [grid-template-columns:28px_32px_minmax(0,1fr)_minmax(0,1.6fr)_3.25rem_3.75rem_32px]
    sm:gap-x-3 sm:[grid-template-columns:32px_36px_minmax(0,1fr)_minmax(0,1.8fr)_3.5rem_4.25rem_36px]
  "
>
  <div class="flex items-center justify-center">
    <button
      type="button"
      class="
      cursor-grab active:cursor-grabbing
      text-muted-foreground
      hover:text-foreground
    "
      data-dnd-handle
      {disabled}
      aria-label="Reorder set"
      tabindex="-1"
    >
      <GripVertical class="h-4 w-4" />
    </button>
  </div>

  <div class="text-sm tabular-nums">
    {setType + 1}
  </div>

  <div class="min-w-0"><!-- badges --></div>

  <div class="min-w-0 text-sm text-muted-foreground truncate tabular-nums">
    <!-- previous: "3 x 70" -->
  </div>

  <input
    class="w-full min-w-0 rounded border bg-background px-1.5 py-1 text-sm text-center tabular-nums"
    type="number"
    min="0"
    inputmode="numeric"
    value={reps}
    {disabled}
    on:change={(e) =>
      void onRepsChange(num((e.currentTarget as HTMLInputElement).value))}
  />

  <input
    class="w-full min-w-0 rounded border bg-background px-2 py-1 text-sm text-center tabular-nums"
    type="number"
    min="0"
    step="0.5"
    inputmode="decimal"
    value={weight}
    {disabled}
    on:change={(e) =>
      void onWeightChange(num((e.currentTarget as HTMLInputElement).value))}
  />

  <div class="flex h-full w-full items-center justify-center">
    <Checkbox
      checked={completed}
      {disabled}
      onCheckedChange={(v) => void onCompletedChange(!!v)}
      class="
        h-7 w-7
        border-border
        data-[state=checked]:bg-[#00D000]
        data-[state=checked]:border-[#00D000]
        data-[state=checked]:text-white
      "
    />
  </div>
</div>
