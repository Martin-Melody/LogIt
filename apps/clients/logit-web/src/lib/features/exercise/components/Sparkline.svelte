<script lang="ts">
  const { values = [], width = 72, height = 22, class: klass = "" } = $props<{
    values?: number[];
    width?: number;
    height?: number;
    class?: string;
  }>();

  const path = $derived.by(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = width / (values.length - 1);
    return values
      .map((v: number, i: number) => {
        const x = i * stepX;
        const y = height - ((v - min) / span) * (height - 2) - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });

  const up = $derived(values.length >= 2 && values[values.length - 1] >= values[0]);
</script>

{#if path}
  <svg {width} {height} viewBox="0 0 {width} {height}" class={klass} aria-hidden="true">
    <path
      d={path}
      fill="none"
      stroke="currentColor"
      class={up ? "text-emerald-500" : "text-rose-500"}
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/if}
