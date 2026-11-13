<script lang="ts">
  import TrendingUp from "@lucide/svelte/icons/trending-up";
  import Timer from "@lucide/svelte/icons/timer";
  import Trophy from "@lucide/svelte/icons/trophy";
  import WifiOff from "@lucide/svelte/icons/wifi-off";
  import Lock from "@lucide/svelte/icons/lock";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import ToggleRight from "@lucide/svelte/icons/toggle-right";
  import Phone from "$lib/site/Phone.svelte";
  import PlayBadge from "$lib/site/PlayBadge.svelte";
  import CheckList from "$lib/site/CheckList.svelte";
  import Eyebrow from "$lib/site/Eyebrow.svelte";
  import { GITHUB_URL, PLAY_CANCEL_PATH, PRICES, REGISTRY_URL } from "$lib/site";

  const stats = [
    { value: "250,000+", label: "foods, searchable offline" },
    { value: "0", label: "ads, trackers or sign-up walls" },
    { value: "1 tap", label: "to log a set as planned" },
    { value: "MIT", label: "open source, self-host free", accent: true },
  ];

  const gallery = [
    { name: "home", alt: "Home screen with today's plan and recent sessions", title: "Home", text: "Today's plan, swipe ahead to tomorrow. Choose your own cards." },
    { name: "sessions", alt: "Sessions calendar with this week's workouts", title: "Sessions", text: "Calendar, streak, PRs and what went up since last time." },
    { name: "progress", alt: "Progress screen with a weekly streak and goals", title: "Progress", text: "Weekly streak, goals, exercise and muscle charts." },
    { name: "habits", alt: "Habits list with daily check-offs and streaks", title: "Habits", text: "Daily or weekly, ticked off in a second." },
    { name: "insights", alt: "Nutrition insights", title: "Insights", text: "Averages, on-target days and your real weekly rate." },
    { name: "plugins-installed", alt: "Installed and built-in plugins", title: "Plugins", text: "What's installed, what's built in, and a switch for each." },
  ];

  const families = [
    { name: "Progression", text: "Suggest the next weight and reps for a lift." },
    { name: "Mobility progression", text: "Suggest the next hold time or reps for a stretch." },
    { name: "Home widgets", text: "Your own card on the home screen." },
    { name: "Exercise analytics", text: "Custom charts and numbers for an exercise." },
    { name: "Muscle insights", text: "What your training says about a muscle group." },
    { name: "Nutrition targets", text: "Your own way of setting calories and macros." },
    { name: "Nutrition analytics", text: "Weekly recaps, adherence, your own insights." },
    { name: "Exercise packs", text: "New exercises for the catalogue. Just data." },
    { name: "Mobility packs", text: "New stretches and drills. Just data." },
  ];

  const pluginSteps = [
    { title: "Build", text: "One JavaScript file and a manifest. No SDK, no build server." },
    { title: "Publish", text: "Open a pull request to the community registry, or host your own." },
    { title: "Share", text: "Post it to your feed. Coaches can put a whole team on it." },
    { title: "Install", text: "One tap in Browse plugins. Then it works offline like the rest of the app." },
  ];

  const everything = [
    { title: "Logging", items: ["Start from your split, a program, last time or blank", "Weight, reps, RPE, warm-ups, drop sets, AMRAP", "Supersets and timed circuits with a countdown", "Cardio and mobility in the same workout", "Bodyweight and assisted exercises"] },
    { title: "Planning", items: ["Splits in order or on set weekdays", "Rest days and two-a-days", "Built-in programs: full body, upper/lower, PPL, 5×5", "Save any past workout as a split day"] },
    { title: "Progression", items: ["Next weight and reps for every set, with the reason", "Learns your best rep ranges and weekly sets", "Estimated 1RM on every lift", "Stretching progresses too", "Leave a bad day out of it"] },
    { title: "Progress", items: ["Goals with a likely date range", "Weekly streak with pauses", "Milestone badges", "Exercise and muscle charts"] },
    { title: "Food and body", items: ["250,000+ foods offline, barcode and label scan", "Recipes, saved meals, meal plans, photos", "Targets that follow your weight trend", "Insights: do your lifts go better on target days?"] },
    { title: "Social", items: ["Follow friends, like, comment, repost and quote", "Share workouts, PRs, splits, habits and plugins", "Copy a shared split or exercise in one tap", "Report and block"] },
    { title: "Plugins", items: ["Install progression styles, widgets, charts and packs", "Build your own in plain JavaScript", "Publish to the registry or share by link", "Sandboxed, checked on install, off until you allow it"] },
    { title: "Yours", items: ["Arrange the home screen and bottom bar", "Light and dark mode", "Export everything, import it back", "Self-host the server for free"] },
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
  <!-- ═════════ HERO ═════════ -->
  <section class="relative px-4 sm:px-6">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 -top-24 bottom-0 -z-0"
      style="background: radial-gradient(55% 60% at 12% 78%, color-mix(in oklch, var(--chart-1) 30%, transparent) 0%, transparent 70%), radial-gradient(45% 55% at 90% 85%, color-mix(in oklch, var(--highlight) 12%, transparent) 0%, transparent 70%)"
    ></div>

    <div class="relative mx-auto flex max-w-[860px] flex-col items-center gap-5 pt-14 text-center sm:pt-16">
      <span class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground">
        <span class="size-1.5 rounded-full bg-success"></span>
        Android first. Free, no account needed.
      </span>
      <h1 class="text-[40px] font-bold leading-[1.04] tracking-[-0.035em] text-heading sm:text-[62px]">Log every set.<br />Know the next one.</h1>
      <p class="max-w-[560px] text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
        A workout, food and habit tracker that works out your next weight, shows you why, and keeps everything on your phone.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-3 pt-1.5">
        <PlayBadge height={52} />
        <span class="rounded-[10px] border border-dashed border-foreground/15 px-4 py-3 text-sm text-muted-foreground">iPhone: coming later</span>
      </div>
    </div>

    <div class="relative mx-auto mt-14 flex h-[560px] max-w-[1160px] items-start justify-center gap-7 overflow-hidden">
      <div class="hidden max-w-[290px] flex-1 flex-col gap-3.5 pt-[70px] lg:flex">
        <div class="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-4">
          <span class="flex items-center gap-2 text-[13px] font-semibold text-success"><TrendingUp class="size-[15px]" strokeWidth={2.2} aria-hidden="true" />Next weight, worked out</span>
          <span class="text-sm leading-relaxed text-foreground/85">Last week: 5 × 160 kg. Today it's ready at <strong class="text-heading">165</strong>.</span>
        </div>
        <div class="ml-7 flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-4">
          <span class="flex items-center gap-2 text-[13px] font-semibold text-info"><Timer class="size-[15px]" strokeWidth={2.2} aria-hidden="true" />Rest timer</span>
          <span class="text-sm leading-relaxed text-foreground/85">Starts when you tick a set. Buzzes when it's time.</span>
        </div>
      </div>

      <Phone name="workout" alt="LogIt workout screen: deadlift sets at 165 kg with a rest timer running" width={300} eager />

      <div class="hidden max-w-[290px] flex-1 flex-col gap-3.5 pt-[150px] lg:flex">
        <div class="flex flex-col gap-1.5 rounded-[14px] border border-highlight/35 bg-card p-4">
          <span class="flex items-center gap-2 text-[13px] font-semibold text-highlight"><Trophy class="size-[15px]" strokeWidth={2.2} aria-hidden="true" />PRs spotted for you</span>
          <span class="text-sm leading-relaxed text-foreground/85">Incline bench 70 × 9: most reps at that weight.</span>
        </div>
        <div class="mr-7 flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-4">
          <span class="flex items-center gap-2 text-[13px] font-semibold text-primary"><WifiOff class="size-[15px]" strokeWidth={2.2} aria-hidden="true" />No signal? Fine.</span>
          <span class="text-sm leading-relaxed text-foreground/85">Everything works offline, even the food database.</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ═════════ STAT ROW (the app's session stats card) ═════════ -->
  <section class="border-t border-border bg-sidebar px-4 sm:px-6">
    <dl class="mx-auto grid max-w-[1160px] grid-cols-2 text-center lg:grid-cols-4">
      {#each stats as s, i (s.label)}
        <div class="px-3 py-7 {i % 2 === 0 ? 'border-r border-border' : ''} {i < 2 ? 'border-b border-border lg:border-b-0' : ''} {i === 1 ? 'lg:border-r' : ''}">
          <dt class="sr-only">{s.label}</dt>
          <dd class="text-[28px] font-semibold sm:text-[30px] {s.accent ? 'text-highlight' : 'text-heading'}">{s.value}</dd>
          <dd class="mt-1 text-[13px] text-muted-foreground">{s.label}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <!-- ═════════ FEATURES ═════════ -->
  <section id="features" class="scroll-mt-6 px-4 pb-10 pt-24 sm:px-6 sm:pt-32">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-28 sm:gap-36">
      <!-- History -->
      <div class="flex flex-wrap items-center gap-16">
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
          <Eyebrow>History</Eyebrow>
          <h2 class="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-heading sm:text-[40px]">Every workout, compared with the last one.</h2>
          <p class="text-[17px] leading-[1.65] text-muted-foreground">Open any session and see what went up, what went down and which sets were PRs. Spot a mistake? Fix it. Liked a workout? Do it again, or save it as a split day.</p>
          <CheckList items={["Calendar of every workout, search any exercise", "Last time shown next to every set", "Edit sets, exercises, times and notes afterwards"]} />
        </div>
        <Phone name="session-detail" alt="Session screen: Upper B with 6 PRs and a comparison with last time" class="mx-auto" />
      </div>

      <!-- Progression -->
      <div class="flex flex-wrap-reverse items-center gap-16">
        <div class="mx-auto flex items-start gap-[18px]">
          <Phone name="prog-list" alt="Every exercise with a progressing label and a trend line" width={250} />
          <Phone name="prog-muscles" alt="Muscle groups with weekly sets and what volume works best" width={210} class="mt-[70px] hidden sm:block" />
        </div>
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
          <Eyebrow>Progression</Eyebrow>
          <h2 class="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-heading sm:text-[40px]">Know what's working, lift by lift.</h2>
          <p class="text-[17px] leading-[1.65] text-muted-foreground">Every exercise gets an honest label: progressing, plateaued or going backwards, with a "Why?" that shows the numbers behind it. Each muscle group shows how many weekly sets you do best on, worked out from your own training.</p>
          <div class="flex flex-wrap gap-2 text-[13px]">
            <span class="rounded-full border border-success/35 bg-success/10 px-2.5 py-1 text-success">Progressing</span>
            <span class="rounded-full border border-highlight/35 bg-highlight/10 px-2.5 py-1 text-highlight">Plateaued</span>
            <span class="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-destructive">Regressing</span>
          </div>
          <CheckList items={["Charts for max weight, volume and estimated 1RM", "Tag a training block and compare blocks", "Pick a different progression style, or install one"]} />
        </div>
      </div>

      <!-- Goals -->
      <div class="flex flex-wrap items-center gap-16">
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
          <Eyebrow>Goals</Eyebrow>
          <h2 class="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-heading sm:text-[40px]">Goals with a date on them.</h2>
          <p class="text-[17px] leading-[1.65] text-muted-foreground">Pick a lift, a rep target, a workout count or a bodyweight. LogIt draws where your training is heading and gives you an honest range for when you'll get there, not a single made-up date.</p>
          <CheckList items={["Weekly streak against your own target, so rest days never break it", "Pause it when you're injured or away", "Milestones like a bodyweight bench or a two-plate squat"]} />
        </div>
        <Phone name="goal" alt="Goal screen: bench press 90 kg for 5, on pace for late November" class="mx-auto" />
      </div>

      <!-- Nutrition -->
      <div class="flex flex-wrap-reverse items-center gap-16">
        <div class="mx-auto flex items-start gap-[18px]">
          <Phone name="nutrition" alt="Nutrition diary for today with calorie and macro bars" width={250} />
          <Phone name="insights" alt="Nutrition insights: average calories, on-target days and weekly weight change" width={210} class="mt-[70px] hidden sm:block" />
        </div>
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
          <Eyebrow>Nutrition</Eyebrow>
          <h2 class="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-heading sm:text-[40px]">Food tracking built around your training.</h2>
          <p class="text-[17px] leading-[1.65] text-muted-foreground">Scan a barcode or the nutrition label, or search 250,000 foods without signal. Your calorie target follows your weight trend each week, so a bulk or a cut stays on course.</p>
          <div class="flex flex-wrap gap-2 text-[13px]">
            <span class="rounded-lg bg-macro-protein/10 px-2.5 py-1.5 text-macro-protein">Protein</span>
            <span class="rounded-lg bg-macro-carbs/10 px-2.5 py-1.5 text-macro-carbs">Carbs</span>
            <span class="rounded-lg bg-macro-fat/10 px-2.5 py-1.5 text-macro-fat">Fat</span>
            <span class="rounded-lg border border-border bg-card px-2.5 py-1.5 text-foreground/85">Recipes and saved meals</span>
            <span class="rounded-lg border border-border bg-card px-2.5 py-1.5 text-foreground/85">Meal photos</span>
            <span class="rounded-lg border border-border bg-card px-2.5 py-1.5 text-foreground/85">Bodyweight trend</span>
          </div>
        </div>
      </div>

      <!-- Social -->
      <div class="flex flex-wrap items-center gap-16">
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
          <Eyebrow>Social</Eyebrow>
          <h2 class="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-heading sm:text-[40px]">Your gym friends, not influencers.</h2>
          <p class="text-[17px] leading-[1.65] text-muted-foreground">Follow the people you actually train with. Post a workout, a PR, a habit streak, a whole split or a plugin, and they can copy it to their own app in one tap. Optional, free, and off until you sign up.</p>
          <div class="flex flex-wrap gap-2 text-[13px]">
            {#each ["Workouts", "PRs", "Splits", "Habits", "Exercises", "Plugins"] as tag (tag)}
              <span class="rounded-lg border px-2.5 py-1.5 {tag === 'PRs' ? 'border-highlight/25 bg-highlight/10 text-highlight' : 'border-border bg-card text-foreground/85'}">{tag}</span>
            {/each}
          </div>
          <p class="text-sm text-muted-foreground">Likes, comments, reposts and quotes. Report and block built in.</p>
        </div>
        <div class="mx-auto flex items-start gap-[18px]">
          <Phone name="feed" alt="Feed with a deadlift PR, a workout and a habit streak from friends" width={250} />
          <Phone name="post" alt="A PR post with comments from friends" width={210} class="mt-[70px] hidden sm:block" />
        </div>
      </div>
    </div>
  </section>

  <!-- ═════════ PLUGINS ═════════ -->
  <section id="plugins" class="mt-28 scroll-mt-6 border-y border-border bg-sidebar px-4 pb-28 pt-24 sm:mt-36 sm:px-6"
    style="background-image: radial-gradient(50% 40% at 50% 0%, color-mix(in oklch, var(--chart-1) 16%, transparent) 0%, transparent 70%)">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-16">
      <div class="mx-auto flex max-w-[720px] flex-col items-center gap-[18px] text-center">
        <Eyebrow>Plugins</Eyebrow>
        <h2 class="text-[36px] font-bold leading-[1.05] tracking-[-0.035em] text-heading sm:text-[52px]">Missing something?<br />Build it, then share it.</h2>
        <p class="text-[17px] leading-relaxed text-muted-foreground sm:text-lg">LogIt is built out of plugins. Write your own progression rule, home-screen card, chart or exercise pack in plain JavaScript. Publish it, and anyone can install it with a tap.</p>
      </div>

      <ol class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        {#each pluginSteps as step, i (step.title)}
          <li class="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5">
            <span class="text-[13px] font-semibold text-chart-1">0{i + 1}</span>
            <span class="text-[17px] font-semibold text-heading">{step.title}</span>
            <span class="text-sm leading-normal text-muted-foreground">{step.text}</span>
          </li>
        {/each}
      </ol>

      <div class="flex flex-wrap items-start justify-center gap-7">
        <figure class="min-w-0 max-w-[520px] flex-[1_1_420px] overflow-hidden rounded-[14px] border border-border bg-background">
          <figcaption class="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] text-muted-foreground">
            <span class="font-mono text-foreground/85">linear-plus/bundle.js</span>
            <span>Excerpt, simplified</span>
          </figcaption>
          <pre class="overflow-x-auto px-[18px] pb-[22px] pt-[18px] font-mono text-[13px] leading-[1.75] text-foreground/85"><span class="text-muted-foreground">export const</span> algorithm = &#123;
  id: <span class="text-success">"com.example.linear-plus"</span>,
  name: <span class="text-success">"Linear Plus"</span>,

  suggest(input) &#123;
    <span class="text-muted-foreground">const</span> last = input.history[<span class="text-highlight">0</span>];
    <span class="text-muted-foreground">const</span> sets = last.sets.filter(isWorkingSet);

    <span class="text-muted-foreground/70">// Filled the rep range? Add weight.</span>
    <span class="text-muted-foreground">if</span> (sets.every((s) =&gt; s.reps &gt;= repCeiling)) &#123;
      <span class="text-muted-foreground">return</span> &#123;
        sets: workingSets(weight + <span class="text-highlight">2.5</span>, repFloor),
        label: <span class="text-success">`Weight up: $&#123;weight + 2.5&#125;kg`</span>,
      &#125;;
    &#125;
    <span class="text-muted-foreground/70">// …otherwise add a rep, or deload after two misses</span>
  &#125;,
&#125;;</pre>
        </figure>
        <div class="flex items-start gap-[18px]">
          <Phone name="plugins-browse" alt="Browse plugins: featured exercise and mobility packs, Linear Plus and Pure Trend" width={240} />
          <Phone name="feed-plugin" alt="A coach sharing the Linear Plus plugin on the feed" width={200} class="mt-[60px] hidden sm:block" />
        </div>
      </div>

      <div class="flex flex-col gap-[18px]">
        <h3 class="text-center text-[22px] font-semibold text-heading">Nine kinds of plugin</h3>
        <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {#each families as f (f.name)}
            <div class="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5">
              <span class="text-[15px] font-semibold text-foreground">{f.name}</span>
              <span class="text-[13px] leading-snug text-muted-foreground">{f.text}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="grid gap-7 border-t border-border pt-10 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <div class="flex gap-3.5"><Lock class="size-[22px] shrink-0 text-primary" aria-hidden="true" /><div class="flex flex-col gap-1"><span class="font-semibold text-foreground">Sandboxed</span><span class="text-sm leading-normal text-muted-foreground">Code runs in a locked-down sandbox: no internet, no storage, no access to the rest of your phone.</span></div></div>
        <div class="flex gap-3.5"><ShieldCheck class="size-[22px] shrink-0 text-primary" aria-hidden="true" /><div class="flex flex-col gap-1"><span class="font-semibold text-foreground">Checked on install</span><span class="text-sm leading-normal text-muted-foreground">Every file is matched against its fingerprint. Registry plugins are reviewed by a person first.</span></div></div>
        <div class="flex gap-3.5"><ToggleRight class="size-[22px] shrink-0 text-primary" aria-hidden="true" /><div class="flex flex-col gap-1"><span class="font-semibold text-foreground">Off until you say so</span><span class="text-sm leading-normal text-muted-foreground">Plugins that run code stay switched off until you turn them on. Exercise packs are just data.</span></div></div>
      </div>

      <div class="flex flex-wrap justify-center gap-3">
        <a href="/docs/plugins" class="rounded-lg bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground hover:bg-primary/90">Read the plugin docs</a>
        <a href={REGISTRY_URL} class="rounded-lg border border-foreground/10 bg-card px-5 py-3 text-[15px] font-semibold text-foreground hover:bg-accent">Browse the registry</a>
      </div>
    </div>
  </section>

  <!-- ═════════ GALLERY ═════════ -->
  <section class="pb-10 pt-24" aria-labelledby="gallery-title">
    <div class="mx-auto flex max-w-[1080px] flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
      <h2 id="gallery-title" class="text-[30px] font-bold tracking-[-0.03em] text-heading sm:text-[34px]">And the rest of it.</h2>
      <span class="text-sm text-muted-foreground">Real screens. Scroll for more.</span>
    </div>
    <!-- Focusable so keyboard users can scroll the strip (a scrollable region must take focus). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="mt-8 flex gap-[22px] overflow-x-auto px-4 pb-7 pt-2 sm:px-[max(24px,calc((100%-1032px)/2))]" tabindex="0" role="region" aria-label="More app screens">
      {#each gallery as g (g.name)}
        <figure class="flex w-[232px] shrink-0 flex-col gap-3.5">
          <Phone name={g.name} alt={g.alt} width={232} />
          <figcaption class="flex flex-col gap-0.5 px-1"><span class="text-[15px] font-semibold text-foreground">{g.title}</span><span class="text-[13px] leading-snug text-muted-foreground">{g.text}</span></figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <!-- ═════════ EVERYTHING ═════════ -->
  <section id="everything" class="scroll-mt-6 px-4 pb-24 pt-20 sm:px-6">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-9">
      <div class="flex max-w-[640px] flex-col gap-2.5">
        <h2 class="text-[30px] font-bold tracking-[-0.03em] text-heading sm:text-[34px]">Everything LogIt does.</h2>
        <p class="text-base leading-relaxed text-muted-foreground">All free on your phone. Pro adds sync and the web dashboard.</p>
      </div>
      <div class="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {#each everything as grp (grp.title)}
          <div class="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px]">
            <h3 class="text-base font-semibold text-heading">{grp.title}</h3>
            <ul>
              {#each grp.items as item (item)}
                <li class="border-t border-border py-2.5 text-sm leading-snug text-foreground/85">{item}</li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ═════════ PLANS ═════════ -->
  <section class="px-4 pb-24 sm:px-6">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-7 rounded-[20px] border border-border bg-card p-6 sm:p-9">
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

  <!-- ═════════ OPEN SOURCE ═════════ -->
  <section class="px-4 pb-24 sm:px-6">
    <div class="mx-auto flex max-w-[1080px] flex-wrap items-center gap-10">
      <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
        <h2 class="text-[26px] font-bold tracking-[-0.03em] text-heading sm:text-[30px]">Open source, and yours to keep.</h2>
        <p class="text-base leading-[1.65] text-muted-foreground">Export everything to a file whenever you like. Prefer your own server? The whole stack is one Docker Compose file, with sync and the dashboard included.</p>
        <a href="/open-source" class="text-[15px] font-semibold text-foreground underline-offset-4 hover:underline">Self-hosting and plugin docs →</a>
      </div>
      <pre class="min-w-0 flex-[1_1_380px] overflow-x-auto rounded-[14px] border border-border bg-card px-[22px] py-5 font-mono text-sm leading-[1.9] text-foreground/85"><span class="text-muted-foreground/70">$</span> git clone {GITHUB_URL}
<span class="text-muted-foreground/70">$</span> cp .env.example .env
<span class="text-muted-foreground/70">$</span> docker compose up -d</pre>
    </div>
  </section>

  <!-- ═════════ FAQ ═════════ -->
  <section class="px-4 pb-24 sm:px-6">
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
</div>
