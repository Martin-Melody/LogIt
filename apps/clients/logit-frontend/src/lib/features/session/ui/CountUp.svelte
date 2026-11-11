<script lang="ts">
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

  let display = $state("0");
  // Last number reached, so a value that changes later (bodyweight loading in
  // after the recap opened) counts on from there instead of jumping or from 0.
  let shown = 0;
  let first = true;

  $effect(() => {
    const target = value;
    const fmt = format;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      shown = target;
      display = fmt(target);
      return;
    }

    const from = shown;
    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      first = false;
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        shown = from + (target - from) * eased;
        display = fmt(shown);
        if (t < 1) raf = requestAnimationFrame(step);
        else display = fmt(target);
      };
      raf = requestAnimationFrame(step);
    }, first ? delay : 0);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  });
</script>

<span class="tabular-nums">{display}</span>
