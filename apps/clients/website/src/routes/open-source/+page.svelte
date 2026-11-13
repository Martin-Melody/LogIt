<script lang="ts">
  import Eyebrow from "$lib/site/Eyebrow.svelte";
  import { GITHUB_URL, REGISTRY_URL } from "$lib/site";

  const steps = [
    { title: "Get the files", text: "Clone the repo or download a release." },
    { title: "Set two secrets", text: "JWT_SECRET and ADMIN_KEY in .env." },
    { title: "Start it", text: "docker compose up -d. Your data lives in a Docker volume." },
    { title: "Connect the app", text: "On the sign-in screen, choose “Connect to a different server”." },
    { title: "Open the dashboard", text: "The web dashboard runs next to the API." },
  ];

  const docs = [
    { href: "/docs/plugins", title: "Getting started", text: "What a plugin is, how it loads, what it can touch." },
    { href: "/docs/plugins/progression", title: "Progression", text: "Suggest the next weight and reps." },
    { href: "/docs/plugins/widgets", title: "Widgets and primitives", text: "Home-screen cards from building blocks." },
    { href: "/docs/plugins/analytics", title: "Analytics and nutrition", text: "Insights over training and food data." },
    { href: "/docs/plugins/exercise-packs", title: "Exercise and mobility packs", text: "Ship exercises, stretches and their progressions." },
    { href: "/docs/plugins/publishing", title: "Publishing and trust", text: "The registry, the sandbox and the API reference." },
  ];
</script>

<svelte:head>
  <title>Open source · LogIt</title>
  <meta name="description" content="LogIt is MIT licensed. Self-host the sync server and web dashboard with Docker Compose, or build plugins for the app." />
</svelte:head>

<section class="px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
  <div class="mx-auto flex max-w-[1120px] flex-wrap items-center gap-12">
    <div class="flex min-w-0 flex-[1_1_460px] flex-col gap-[18px]">
      <Eyebrow>MIT licensed</Eyebrow>
      <h1 class="text-[38px] font-bold leading-[1.08] tracking-[-0.03em] text-heading sm:text-[50px]">Run your own LogIt server.</h1>
      <p class="text-lg leading-relaxed text-muted-foreground">The app, the sync server and the web dashboard are all open source. Self-host the server and you get sync and the dashboard free, on hardware you control.</p>
      <div class="flex flex-wrap gap-3">
        <a href="/self-hosting" class="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90">Self-hosting guide</a>
        <a href={GITHUB_URL} class="rounded-lg border border-foreground/15 px-5 py-3 font-semibold text-foreground hover:bg-accent">View on GitHub</a>
      </div>
    </div>
    <pre class="min-w-0 flex-[1_1_400px] overflow-x-auto rounded-2xl border border-border bg-card p-6 font-mono text-sm leading-[1.9] text-foreground/85"><span class="text-muted-foreground/70"># needs Docker with Compose</span>
<span class="text-muted-foreground/70">$</span> git clone {GITHUB_URL}
<span class="text-muted-foreground/70">$</span> cd LogIt &amp;&amp; cp .env.example .env
<span class="text-muted-foreground/70"># set JWT_SECRET and ADMIN_KEY in .env</span>
<span class="text-muted-foreground/70">$</span> docker compose up -d</pre>
  </div>
</section>

<section class="border-y border-border bg-sidebar px-4 py-14 sm:px-6">
  <div class="mx-auto flex max-w-[1120px] flex-col gap-7">
    <h2 class="text-[28px] font-bold tracking-[-0.03em] text-heading">Self-hosting in five steps</h2>
    <ol class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {#each steps as step, i (step.title)}
        <li class="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5">
          <span class="text-[13px] font-bold text-chart-1">{i + 1}</span>
          <span class="font-semibold text-heading">{step.title}</span>
          <span class="text-sm leading-normal text-muted-foreground">{step.text}</span>
        </li>
      {/each}
    </ol>
    <a href="/self-hosting" class="font-semibold text-foreground underline-offset-4 hover:underline">Read the full guide: requirements, updating, backups →</a>
  </div>
</section>

<section class="px-4 py-20 sm:px-6">
  <div class="mx-auto flex max-w-[1120px] flex-col gap-7">
    <div class="flex max-w-[680px] flex-col gap-2.5">
      <h2 class="text-[28px] font-bold tracking-[-0.03em] text-heading">Build plugins</h2>
      <p class="text-[17px] leading-relaxed text-muted-foreground">Progression rules, home-screen widgets, analytics and exercise packs are all plugins. Write your own and share it through the <a href={REGISTRY_URL} class="text-foreground underline underline-offset-2">community registry</a>.</p>
    </div>
    <div class="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
      {#each docs as d (d.href)}
        <a href={d.href} class="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5 transition-colors hover:bg-accent">
          <span class="font-semibold text-heading">{d.title}</span>
          <span class="text-sm leading-normal text-muted-foreground">{d.text}</span>
        </a>
      {/each}
    </div>
  </div>
</section>

<section class="px-4 pb-24 sm:px-6">
  <div class="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-5 rounded-[14px] border border-border bg-card p-7">
    <div class="min-w-0 flex-[1_1_420px]">
      <h2 class="mb-1.5 text-xl font-semibold text-heading">Don't want to run a server?</h2>
      <p class="text-[15px] leading-relaxed text-muted-foreground">Pro is the same software, hosted by us in the EU. It's what pays for the project.</p>
    </div>
    <a href="/pricing" class="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90">See plans</a>
  </div>
</section>
