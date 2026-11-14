<script lang="ts">
  import Phone from "$lib/site/Phone.svelte";
  import PlayBadge from "$lib/site/PlayBadge.svelte";
  import AppParts from "$lib/site/AppParts.svelte";
  import { PLAY_CANCEL_PATH, PRICES } from "$lib/site";

  // Design decisions for this page: docs/website-design.md

  const steps = [
    {
      n: "01",
      label: "Plan",
      title: "Open the app and today is ready.",
      text: "Set up your split once. LogIt keeps it in order, knows which day is next, and fills in every set's weight and reps from how the last ones went.",
      points: [
        "Splits in order or on set weekdays, with rest days and two-a-days",
        "Built-in programs: full body, upper/lower, PPL, 5×5",
        "Learns the rep ranges and weekly sets that work for you",
        "Save any past workout as a split day",
      ],
      screen: { name: "home", alt: "Home screen: quick start for Day 4, Lower B, today's plan and recent sessions" },
    },
    {
      n: "02",
      label: "Lift",
      title: "Quick enough to use between sets.",
      text: "A set that went to plan is one tap. The rest timer starts itself. Whatever the session looks like, it fits in one workout.",
      points: [
        "Warm-up ramps, drop sets, AMRAP and RPE",
        "Supersets and timed circuits with a countdown",
        "Cardio, stretching and bodyweight work in the same session",
        "No signal needed, ever",
      ],
      screen: null,
    },
    {
      n: "03",
      label: "Look back",
      title: "Watch the weeks add up.",
      text: "Every session is compared with the last one and PRs are spotted at any rep count. Over weeks, each lift gets an honest verdict and every goal a likely date.",
      points: [
        "Calendar of every workout; edit, repeat or search any of them",
        "Progressing, plateaued or going backwards, with the numbers behind it",
        "Charts for max weight, volume and estimated 1RM",
        "Weekly streak you can pause when injured or away",
      ],
      screen: { name: "sessions", alt: "Sessions: November calendar, a 9-week streak and this week's workouts with their PRs" },
    },
  ];

  const circuit = [
    { name: "Kettlebell swing", reps: 15, state: "done" },
    { name: "Push-up", reps: 12, state: "now" },
    { name: "Box jump", reps: 10, state: "next" },
  ];

  const outside = [
    { name: "nutrition", title: "Food", alt: "Nutrition diary with calorie and macro bars", text: "Scan a barcode or the label, or search 250,000 foods offline. Recipes, saved meals and a calorie target that follows your weight trend." },
    { name: "habits", title: "Habits", alt: "Habits with daily check-offs and streaks", text: "Sleep, steps, stretching, creatine. Daily or weekly, each with its own streak." },
    { name: "feed", title: "Friends", alt: "Feed with a deadlift PR and a workout from friends", text: "Follow the people you train with. Share a PR or a whole split and they can copy it in one tap. Optional, and off until you sign up." },
  ];

  const yours = [
    { title: "On your phone", text: "No account, no ads, no trackers. Works with no signal, 250,000 foods included." },
    { title: "Arranged your way", text: "Pick your home cards and tab bar, light or dark." },
    { title: "Plugins", text: "Other progression styles, charts and exercise packs, one tap to install.", href: "/docs/plugins", link: "How plugins work" },
    { title: "Open source", text: "MIT. Export everything, or run your own server.", href: "/open-source", link: "Self-hosting" },
  ];

  const faq = [
    { q: "Do I need an account?", a: "No. Everything works on your phone without one. A free account adds the social feed; Pro adds sync and the web dashboard." },
    { q: "What's free and what's paid?", a: "The whole app is free on your phone, with no limits and no ads. You pay only if you want us to host sync and the dashboard (Pro) or to coach clients (Studio)." },
    { q: "How do I cancel?", a: `In the Play Store: ${PLAY_CANCEL_PATH.replace("Play Store › ", "")}.` },
    { q: "Where is my data kept?", a: "On your phone. With Pro it's also kept on our servers in the EU so your devices stay in sync. You can export it or delete your account any time." },
    { q: "Is there an iPhone app?", a: "Not yet. Android comes first; iPhone is planned." },
  ];
</script>

<svelte:head>
  <title>LogIt: workout, food and habit tracker</title>
  <meta name="description" content="Log every set and know the next one. A workout, food and habit tracker that works out your next weight, works offline and never shows you an ad." />
  <meta property="og:title" content="LogIt: log every set, know the next one" />
  <meta property="og:description" content="Workout, food and habit tracking that works offline. Free on Android." />
</svelte:head>

<div class="overflow-x-clip">
  <!-- ═════════ HERO ═════════
       Pulled up under the site header so the topographic lines run behind it too. -->
  <section class="relative -mt-[76px] border-b border-border bg-background px-4 pt-[76px] sm:px-6">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
      <img src="/topo-hero.svg" alt="" class="size-full object-cover object-top" />
    </div>

    <div class="relative mx-auto flex max-w-[1160px] flex-wrap items-end gap-x-10 pt-10 sm:pt-14">
      <div class="flex min-w-0 flex-[1_1_520px] flex-col gap-6 pb-14 lg:pb-28">
        <h1 class="rise-in text-[clamp(40px,5.6vw,80px)] font-extrabold leading-[0.9] tracking-[-0.057em] text-heading">
          Log every set.<br />Know the next one.
        </h1>
        <p class="rise-in max-w-[480px] text-lg leading-relaxed text-muted-foreground sm:text-[19px]" style="--delay: 0.12s">
          Workouts, food and habits in one app. Your next weight is ready before you start, and everything stays on your phone.
        </p>
        <div class="rise-in flex flex-wrap items-center gap-3.5" style="--delay: 0.22s">
          <PlayBadge height={52} />
          <span class="rounded-[10px] border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">iPhone: coming later</span>
        </div>
      </div>

      <!-- Two phones rising out of the bottom edge; on small screens only the front one. -->
      <div class="relative mx-auto h-[520px] w-full max-w-[400px] flex-[1_1_380px] sm:h-[600px]">
        <div class="absolute left-1/2 top-[70px] ml-[-10px] hidden h-[530px] overflow-hidden opacity-90 sm:block">
          <div class="rise-in" style="--delay: 0.55s; --rise: 120px">
            <Phone name="session-detail" alt="Session screen: Upper B with 6 PRs and a comparison with last time" width={260} eager />
          </div>
        </div>
        <div class="absolute left-1/2 top-0 h-[520px] -translate-x-1/2 overflow-hidden sm:right-1/2 sm:left-auto sm:-mr-[30px] sm:h-[600px] sm:translate-x-0">
          <div class="rise-in" style="--delay: 0.35s; --rise: 120px">
            <Phone name="workout" alt="LogIt workout screen: deadlift sets at 165 kg with a rest timer running" width={300} eager />
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ═════════ THE APP'S OWN PIECES ═════════ -->
  <AppParts />

  <!-- ═════════ TRAINING WEEK ═════════ -->
  <section id="features" aria-labelledby="week-title" class="mx-auto max-w-[1208px] scroll-mt-6 px-4 pt-32 sm:px-6 sm:pt-40">
    <div class="flex flex-wrap items-end justify-between gap-x-16 gap-y-5">
      <h2 id="week-title" class="max-w-[760px] text-balance text-[40px] font-extrabold leading-[0.95] tracking-[-0.055em] text-heading sm:text-[56px] lg:text-[68px]">Built around your training week.</h2>
      <p class="max-w-[420px] text-lg leading-relaxed text-muted-foreground">Planning it, lifting it, and seeing it add up, with food and habits alongside.</p>
    </div>

    <ol class="mt-16 flex flex-col sm:mt-[72px]">
      {#each steps as step, i (step.n)}
        {@const last = i === steps.length - 1}
        <li class="grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-x-6">
          <div aria-hidden="true" class="flex flex-col items-center">
            <span
              class="flex size-11 items-center justify-center rounded-full border text-sm font-semibold
                {last ? 'border-highlight/45 bg-highlight/[0.09] text-highlight' : 'border-input bg-card text-heading'}"
            >{step.n}</span>
            {#if !last}<span class="w-px flex-1 bg-input"></span>{/if}
          </div>

          <div class="flex flex-wrap items-start gap-12 {last ? '' : 'pb-24 sm:pb-28'}">
            <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px] pt-1.5">
              <span class="text-sm font-semibold text-muted-foreground">{step.label}</span>
              <h3 class="text-balance text-[30px] font-bold leading-[1.05] tracking-[-0.045em] text-heading sm:text-[44px]">{step.title}</h3>
              <p class="max-w-[500px] text-[17px] leading-[1.65] text-muted-foreground">{step.text}</p>
              <ul class="flex flex-col text-[15px] text-foreground">
                {#each step.points as point, j (point)}
                  <li class="border-t border-input py-3 {j === step.points.length - 1 ? 'border-b' : ''}">{point}</li>
                {/each}
              </ul>
            </div>

            {#if step.screen}
              <Phone name={step.screen.name} alt={step.screen.alt} width={270} class="mx-auto" />
            {:else}
              <!-- A circuit and a cardio entry, rebuilt with the app's styles. -->
              <div class="mx-auto flex w-full min-w-0 max-w-[360px] flex-[0_1_360px] flex-col gap-3.5">
                <div class="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                  <div class="flex items-center justify-between bg-sidebar px-[18px] py-4">
                    <span class="text-[17px] font-semibold text-heading">Finisher circuit</span>
                    <span class="text-sm text-muted-foreground">Round 2 of 3</span>
                  </div>
                  <div class="flex items-baseline justify-center gap-2.5 px-[18px] pb-2.5 pt-6">
                    <span class="text-[64px] font-bold leading-none tracking-[-0.04em] text-heading">0:34</span>
                    <span class="text-sm text-muted-foreground">left</span>
                  </div>
                  <div class="px-[18px] pb-4">
                    <div class="h-[5px] overflow-hidden rounded-full bg-accent"><div class="h-full w-[57%] bg-primary"></div></div>
                  </div>
                  {#each circuit as station (station.name)}
                    <div
                      class="flex justify-between border-t border-input px-[18px] py-3
                        {station.state === 'now' ? 'bg-sidebar font-semibold text-heading' : station.state === 'done' ? 'text-muted-foreground' : 'text-foreground'}"
                    >
                      <span>{station.name}</span><span>{station.reps}</span>
                    </div>
                  {/each}
                </div>
                <div class="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-card px-[18px] py-3.5">
                  <span class="flex flex-col gap-0.5">
                    <span class="font-semibold text-heading">Incline walk</span>
                    <span class="text-[13px] text-muted-foreground">Cardio · after the circuit</span>
                  </span>
                  <span class="text-[15px] text-foreground">20 min · 12%</span>
                </div>
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <!-- ═════════ OUTSIDE THE GYM ═════════ -->
  <section aria-labelledby="outside-title" class="mx-auto max-w-[1208px] px-4 pt-32 sm:px-6 sm:pt-40">
    <h2 id="outside-title" class="mb-9 text-[32px] font-bold leading-none tracking-[-0.05em] text-heading sm:text-[50px]">And outside the gym.</h2>
    <div class="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
      {#each outside as card (card.name)}
        <article class="flex flex-col overflow-hidden rounded-[22px] border border-border bg-card">
          <div class="h-[300px] overflow-hidden bg-sidebar px-10 pt-6">
            <img
              src="/screens/{card.name}.webp"
              alt={card.alt}
              width="780"
              height="1688"
              loading="lazy"
              decoding="async"
              class="block h-auto w-full rounded-t-[22px] ring-1 ring-input"
            />
          </div>
          <div class="flex flex-col gap-2 p-6">
            <h3 class="text-[22px] font-bold tracking-[-0.03em] text-heading">{card.title}</h3>
            <p class="text-[15px] leading-relaxed text-muted-foreground">{card.text}</p>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <!-- ═════════ YOURS ═════════ -->
  <section class="mx-auto flex max-w-[1208px] flex-wrap items-start gap-10 px-4 pt-32 sm:px-6 sm:pt-36">
    <h2 class="flex-[1_1_340px] text-balance text-[32px] font-bold leading-[1.05] tracking-[-0.045em] text-heading sm:text-[46px]">Yours to keep, and to change.</h2>
    <div class="grid flex-[2_1_560px] gap-x-9 gap-y-7 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {#each yours as item (item.title)}
        <div class="flex flex-col gap-1.5">
          <span class="font-semibold text-heading">{item.title}</span>
          <span class="text-[15px] leading-relaxed text-muted-foreground">{item.text}</span>
          {#if item.href}
            <a href={item.href} class="text-sm font-medium text-foreground underline-offset-4 hover:underline">{item.link} →</a>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- ═════════ PLANS ═════════ -->
  <section class="px-4 pt-32 sm:px-6 sm:pt-36">
    <div class="mx-auto flex max-w-[1160px] flex-col gap-7 rounded-[20px] border border-border bg-card p-6 sm:p-9">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-2">
          <h2 class="text-[26px] font-bold tracking-[-0.03em] text-heading sm:text-[30px]">Free to use. Pay for hosting if you want it.</h2>
          <p class="text-[15px] text-muted-foreground">Subscribe inside the app. Cancel any time in Google Play.</p>
        </div>
        <a href="/pricing" class="rounded-lg bg-primary px-[18px] py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Compare plans</a>
      </div>
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <div class="flex flex-col gap-1.5 rounded-xl bg-secondary p-[18px]"><span class="font-semibold text-heading">Free · €0</span><span class="text-sm leading-normal text-muted-foreground">The whole app on your phone. Free account for the social feed.</span></div>
        <div class="flex flex-col gap-1.5 rounded-xl bg-secondary p-[18px] ring-1 ring-primary/35"><span class="font-semibold text-heading">Pro · {PRICES.pro.monthly}/mo</span><span class="text-sm leading-normal text-muted-foreground">Backup and sync across devices, plus the web dashboard.</span></div>
        <div class="flex flex-col gap-1.5 rounded-xl bg-secondary p-[18px]"><span class="font-semibold text-heading">Studio · {PRICES.studio.monthly}/mo</span><span class="text-sm leading-normal text-muted-foreground">For coaches: clients, programs, check-ins, messages.</span></div>
      </div>
    </div>
  </section>

  <!-- ═════════ FAQ ═════════ -->
  <section class="px-4 pb-28 pt-28 sm:px-6">
    <div class="mx-auto flex max-w-[760px] flex-col gap-6">
      <h2 class="text-[26px] font-bold tracking-[-0.03em] text-heading sm:text-[30px]">Questions</h2>
      <div class="border-t border-foreground/10">
        {#each faq as item, i (item.q)}
          <details class="group border-b border-foreground/10 py-[18px]" open={i === 0}>
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden="true" class="text-muted-foreground transition-transform group-open:rotate-45">+</span>
            </summary>
            <p class="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        {/each}
      </div>
    </div>
  </section>

  <!-- ═════════ CLOSING CALL TO ACTION ═════════ -->
  <section class="relative overflow-hidden border-t border-border bg-background px-4 sm:px-6">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -scale-y-100 opacity-60 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
      <img src="/topo-hero.svg" alt="" class="size-full object-cover" />
    </div>
    <div class="relative mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-7 py-24">
      <h2 class="text-[40px] font-extrabold leading-[0.95] tracking-[-0.055em] text-heading sm:text-[56px] lg:text-[72px]">
        Free on Android.<br /><span class="text-muted-foreground">No ads, no account.</span>
      </h2>
      <PlayBadge height={60} />
    </div>
  </section>
</div>
