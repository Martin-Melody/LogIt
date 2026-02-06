<script lang="ts">
  export let setType = "normal";
  export let reps = 0;
  export let weight = 0;
  export let disabled = false;

  export let onRepsChange: (reps: number) => void | Promise<void> = () => {};
  export let onWeightChange: (
    weight: number,
  ) => void | Promise<void> = () => {};

  function num(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
</script>

<div class="grid grid-cols-12 gap-2 items-center">
  <div class="col-span-4 text-sm">{setType}</div>

  <div class="col-span-4">
    <input
      class="w-full rounded border bg-background px-2 py-1 text-sm"
      type="number"
      min="0"
      value={reps}
      {disabled}
      on:change={(e) =>
        void onRepsChange(num((e.currentTarget as HTMLInputElement).value))}
    />
  </div>

  <div class="col-span-4">
    <input
      class="w-full rounded border bg-background px-2 py-1 text-sm"
      type="number"
      min="0"
      step="0.5"
      value={weight}
      {disabled}
      on:change={(e) =>
        void onWeightChange(num((e.currentTarget as HTMLInputElement).value))}
    />
  </div>
</div>
