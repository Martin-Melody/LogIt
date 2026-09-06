<script lang="ts">
  import { onMount } from "svelte";

  const { count = 90, duration = 1800 } = $props<{ count?: number; duration?: number }>();

  let canvas = $state<HTMLCanvasElement | null>(null);

  onMount(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);
    ctx.scale(dpr, dpr);

    const colors = ["#5C6BC0", "#26A69A", "#FFB300", "#EF5350", "#AB47BC", "#66BB6A"];
    const cx = canvas.offsetWidth / 2;
    const cy = canvas.offsetHeight * 0.32;

    type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; };
    const parts: P[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        size: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)]!,
      };
    });

    const start = performance.now();
    let raf = 0;

    function frame(now: number) {
      const t = now - start;
      if (t > duration || !ctx) return;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - t / duration);
      for (const p of parts) {
        p.vy += 0.18; // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<canvas
  bind:this={canvas}
  class="pointer-events-none absolute inset-0 h-full w-full"
  aria-hidden="true"
></canvas>
