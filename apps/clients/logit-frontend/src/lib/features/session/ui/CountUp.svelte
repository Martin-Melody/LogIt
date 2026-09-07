<script lang="ts">
  import { onMount } from "svelte";

  const {
    value = 0,
    duration = 700,
    delay = 0,
    format = (n: number) => String(Math.round(n)),
  } = $props<{
    value?: number;
    duration?: number;
    delay?: number;
    format?: (n: number) => string;
  }>();

  let display = $state(format(0));

  onMount(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      display = format(value);
      return;
    }

    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        display = format(value * eased);
        if (t < 1) raf = requestAnimationFrame(step);
        else display = format(value);
      };
      raf = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  });
</script>

<span class="tabular-nums">{display}</span>
