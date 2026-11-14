<!--
  Pieces of the app rebuilt with the shared theme (not screenshots): a set block, PRs, session stats,
  the weekly streak, progression rows, today's macros and a goal. They play once when scrolled into view.
  Rendered in their final state first, so without JavaScript or with reduced motion nothing is hidden.
-->
<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Trophy from "@lucide/svelte/icons/trophy";
  import TrendingUp from "@lucide/svelte/icons/trending-up";

  let armed = $state(false);
  let visible = $state(false);

  function reveal(node: HTMLElement) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    armed = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          visible = true;
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  const sets = [
    { n: 1, done: true },
    { n: 2, done: false },
    { n: 3, done: false },
  ];
  const week = [
    { d: "M", on: true },
    { d: "T", on: true },
    { d: "W", on: false },
    { d: "T", on: true },
    { d: "F", on: true },
    { d: "S", on: false },
    { d: "S", on: false },
  ];
  const prs = [
    { lift: "Incline Bench Press 70 kg × 9", note: "Most reps at 70 kg" },
    { lift: "Pull-Up 7.5 kg × 6", note: "Heaviest yet. Estimated 1RM 9 kg" },
  ];
  const stats = [
    { value: "55m", label: "Time" },
    { value: "21", label: "Sets" },
    { value: "8,328", label: "kg lifted" },
    { value: "6", label: "PRs", pr: true },
  ];
  const lifts = [
    { name: "Squat", best: "156kg", points: "0,26 12,24 22,22 32,18 44,16 56,12 68,9 80,4" },
    { name: "Leg Curl", best: "63.3kg", points: "0,24 14,22 26,22 38,17 50,15 62,11 72,10 80,6" },
  ];
  const macros = [
    { name: "Protein", color: "text-macro-protein", bar: "bg-macro-protein", eaten: 152, target: 180 },
    { name: "Carbs", color: "text-macro-carbs", bar: "bg-macro-carbs", eaten: 260, target: 380 },
    { name: "Fat", color: "text-macro-fat", bar: "bg-macro-fat", eaten: 61, target: 95 },
  ];

  const setCols = "grid grid-cols-[20px_minmax(0,1fr)_64px_48px_32px] items-center gap-2.5 px-[18px]";
</script>

<section
  use:reveal
  aria-label="Pieces of the app"
  class="parts mx-auto grid max-w-[1208px] items-start gap-[18px] px-4 pt-20 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))] sm:px-6 sm:pt-24"
  class:parts-armed={armed}
  class:parts-visible={visible}
>
  <div class="flex flex-col gap-[18px]">
    <!-- Set block, like the workout screen -->
    <div class="part overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_24px_60px_rgba(0,0,0,0.35)]" style="--delay: 0s">
      <div class="flex items-center justify-between bg-sidebar px-[18px] py-4">
        <span class="text-[17px] font-semibold text-heading">Deadlift</span>
        <span class="text-sm text-muted-foreground">1 of 3</span>
      </div>
      <div class="{setCols} py-2 text-[13px] text-muted-foreground">
        <span>#</span><span>Last</span><span class="text-center">kg</span><span class="text-center">Reps</span><span></span>
      </div>
      {#each sets as set (set.n)}
        <div class="{setCols} py-2 {set.done ? 'bg-sidebar' : ''} {set.n === 3 ? 'pb-4' : ''}">
          <span class="text-muted-foreground">{set.n}</span>
          <span class="text-muted-foreground">5 × 160</span>
          <span class="rounded-lg border border-input py-1.5 text-center text-lg font-semibold {set.done ? 'bg-background text-foreground' : 'text-info'}">165</span>
          <span class="rounded-lg border border-input py-1.5 text-center text-lg font-semibold {set.done ? 'bg-background text-foreground' : 'text-info'}">5</span>
          {#if set.done}
            <span class="tick flex size-[30px] items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
              <Check class="size-4" strokeWidth={3} aria-hidden="true" />
              <span class="sr-only">Done</span>
            </span>
          {:else}
            <span class="size-[30px] rounded-full border-2 border-muted-foreground"></span>
          {/if}
        </div>
        {#if set.done}
          <div class="flex items-center gap-3 px-[18px] pb-2.5 pt-1.5" aria-label="Rest timer, 1:58 left">
            <div class="h-[5px] flex-1 overflow-hidden rounded-full bg-accent"><div class="rest h-full w-[66%] rounded-full bg-primary"></div></div>
            <span class="text-[13px] text-muted-foreground">1:58</span>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Weekly streak -->
    <div class="part flex flex-col gap-3 rounded-[18px] border border-border bg-card p-[18px]" style="--delay: 0.36s">
      <div class="flex justify-between text-sm">
        <span class="font-semibold text-heading">This week</span>
        <span class="text-muted-foreground">4 of 4 · 9-week streak</span>
      </div>
      <ol class="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
        {#each week as day, i (i)}
          <li class="flex flex-col items-center gap-1.5">
            <span class="size-[30px] rounded-full {day.on ? 'bg-success' : 'border border-dashed border-input'}"></span>
            {day.d}<span class="sr-only">{day.on ? ": trained" : ": rest"}</span>
          </li>
        {/each}
      </ol>
    </div>
  </div>

  <div class="flex flex-col gap-[18px] lg:pt-14">
    <!-- PRs, like the session screen -->
    <div class="part flex flex-col gap-3.5 rounded-[18px] border border-highlight/45 bg-highlight/[0.09] p-[18px]" style="--delay: 0.12s">
      {#each prs as pr (pr.lift)}
        <div class="flex gap-3">
          <Trophy class="mt-0.5 size-[22px] shrink-0 text-highlight" strokeWidth={2} aria-hidden="true" />
          <span class="flex flex-col gap-0.5">
            <span class="font-semibold text-heading">{pr.lift}</span>
            <span class="text-sm text-highlight">{pr.note}</span>
          </span>
        </div>
      {/each}
    </div>

    <!-- Session stats card -->
    <dl class="part grid grid-cols-4 rounded-[18px] border border-border bg-card px-2 py-5 text-center" style="--delay: 0.48s">
      {#each stats as s, i (s.label)}
        <div class="flex flex-col-reverse gap-1 {i < 3 ? 'border-r border-input' : ''}">
          <dt class="text-[13px] text-muted-foreground">{s.label}</dt>
          <dd class="text-2xl font-semibold {s.pr ? 'text-highlight' : 'text-heading'}">{s.value}</dd>
        </div>
      {/each}
    </dl>

    <!-- Goal -->
    <div class="part flex flex-col gap-1 rounded-[18px] border border-border bg-card px-[18px] py-4" style="--delay: 0.72s">
      <span class="text-sm text-muted-foreground">Goal · Bench 90 kg × 5</span>
      <span class="text-xl font-semibold text-heading">Likely 20 Nov – 4 Dec</span>
    </div>
  </div>

  <div class="flex flex-col gap-[18px] lg:pt-[18px]">
    <!-- Progression rows, like the progress screen -->
    <div class="part overflow-hidden rounded-[18px] border border-border bg-card" style="--delay: 0.24s">
      {#each lifts as lift, i (lift.name)}
        <div class="flex items-center gap-3 px-[18px] py-4 {i === 0 ? 'border-b border-input' : ''}">
          <span class="flex flex-1 flex-col gap-1.5">
            <span class="text-heading">{lift.name}</span>
            <span class="inline-flex items-center gap-1.5 self-start rounded-full border border-success/35 bg-success/[0.12] px-2.5 py-0.5 text-[13px] text-success">
              <TrendingUp class="size-[13px]" strokeWidth={2.4} aria-hidden="true" />Progressing
            </span>
          </span>
          <svg aria-hidden="true" width="80" height="30" viewBox="0 0 80 30">
            <polyline class="spark" points={lift.points} fill="none" stroke="var(--success)" stroke-width="2" />
          </svg>
          <span class="font-semibold text-heading">{lift.best}</span>
        </div>
      {/each}
    </div>

    <!-- Today's food -->
    <div class="part flex flex-col gap-3.5 rounded-[18px] border border-border bg-card p-[18px]" style="--delay: 0.6s">
      <div class="flex items-baseline justify-between">
        <span class="font-semibold text-heading">Today</span>
        <span class="text-sm text-muted-foreground">2,410 / 3,300 kcal</span>
      </div>
      {#each macros as m (m.name)}
        <div class="flex flex-col gap-1.5 text-[13px]">
          <span class="flex justify-between"><span class={m.color}>{m.name}</span><span class="text-muted-foreground">{m.eaten} / {m.target} g</span></span>
          <div class="h-1.5 rounded-full bg-accent">
            <div class="bar h-full rounded-full {m.bar}" style="width: {Math.round((m.eaten / m.target) * 100)}%"></div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  /* Hidden only once JavaScript has armed the section; shown with a stagger when it scrolls into view. */
  .parts-armed .part {
    opacity: 0;
  }
  .parts-visible .part {
    animation: part-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: var(--delay, 0s);
  }
  @keyframes part-in {
    from {
      opacity: 0;
      transform: translateY(28px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .parts-visible .tick {
    animation: tick 0.3s ease-out 1.1s both;
  }
  @keyframes tick {
    from {
      background: transparent;
      border-color: var(--muted-foreground);
      color: transparent;
    }
  }

  .parts-visible .rest {
    width: 100%;
    transform-origin: left;
    animation: rest 6s linear 1.2s infinite;
  }
  @keyframes rest {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  .parts-armed .spark {
    stroke-dasharray: 200;
    stroke-dashoffset: 200;
  }
  .parts-visible .spark {
    animation: spark 1.2s ease-out 0.9s forwards;
  }
  @keyframes spark {
    to {
      stroke-dashoffset: 0;
    }
  }

  .parts-armed .bar {
    transform: scaleX(0);
    transform-origin: left;
  }
  .parts-visible .bar {
    animation: bar 1s cubic-bezier(0.2, 0.8, 0.2, 1) 1s forwards;
  }
  @keyframes bar {
    to {
      transform: scaleX(1);
    }
  }
</style>
