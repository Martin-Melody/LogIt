<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Minus from "@lucide/svelte/icons/minus";
  import PlayBadge from "$lib/site/PlayBadge.svelte";
  import { PLAY_CANCEL_PATH, PRICES } from "$lib/site";

  const plans = [
    {
      name: "Free",
      blurb: "For anyone training on one phone.",
      price: "€0",
      per: "",
      yearly: "",
      items: ["The whole app: training, progression, goals, nutrition, habits", "Works offline, no account needed", "Plugins, export, self-hosting", "Free account for the social feed"],
      cta: "play",
    },
    {
      name: "Pro",
      blurb: "For training across devices.",
      price: PRICES.pro.monthly,
      per: "/ month",
      yearly: `or ${PRICES.pro.yearly} a year`,
      items: ["Everything in Free", "Backup and sync between your devices", "The web dashboard at app.logit.ie", "Deeper charts: e1RM, volume, nutrition against performance"],
      cta: "app",
      featured: true,
    },
    {
      name: "Studio",
      blurb: "For personal trainers and coaches.",
      price: PRICES.studio.monthly,
      per: "/ month",
      yearly: `or ${PRICES.studio.yearly} a year`,
      items: ["Everything in Pro", "Invite clients. You see nothing until they accept", "Their training, nutrition and habits in one place", "Assign programs, macro targets and check-ins; message clients"],
      cta: "app",
    },
  ];

  const rows: [string, boolean | string, boolean | string, boolean | string][] = [
    ["Workout logging, progression, goals", true, true, true],
    ["Nutrition and habits", true, true, true],
    ["Works offline, data export", true, true, true],
    ["Plugins", true, true, true],
    ["Social feed", "Free account", true, true],
    ["Backup and sync between devices", false, true, true],
    ["Web dashboard", false, true, true],
    ["Coach clients", false, false, true],
  ];

  const steps = [
    { title: "Install LogIt", text: "Get it from Google Play and create an account in Settings › Account." },
    { title: "Tap Upgrade", text: "Pick Pro or Studio, monthly or yearly. Google Play takes the payment." },
    { title: "Cancel whenever", text: "In the Play Store under Payments and subscriptions. You keep your plan until the period ends." },
  ];

  const faq = [
    { q: "Can I pay on the website?", a: "Not yet. Subscriptions are bought in the Android app, through Google Play." },
    { q: "Refunds?", a: "Google Play handles payments and refunds. Request one from your Google Play order history." },
    { q: "What happens if I stop paying?", a: "Your data stays on your phone and the app keeps working. Sync and the web dashboard stop." },
    { q: "Do self-hosters pay?", a: "No. Run the server yourself and sync and the dashboard are free." },
  ];
</script>

<svelte:head>
  <title>Pricing · LogIt</title>
  <meta name="description" content="LogIt is free on your phone. Pro adds sync and the web dashboard; Studio is for coaches. Subscribe in the app, cancel any time in Google Play." />
</svelte:head>

<section class="px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
  <div class="mx-auto flex max-w-[760px] flex-col gap-4 text-center">
    <h1 class="text-[38px] font-bold leading-[1.08] tracking-[-0.03em] text-heading sm:text-[52px]">The app is free.<br class="sm:hidden" /> Hosting is optional.</h1>
    <p class="text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">Everything on your phone is free, with no limits and no ads. Pay only if you want us to host sync and the web dashboard, or to coach clients.</p>
  </div>
</section>

<section class="px-4 pb-20 pt-6 sm:px-6">
  <div class="mx-auto grid max-w-[1120px] items-stretch gap-5 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
    {#each plans as plan (plan.name)}
      <div class="flex flex-col gap-5 rounded-[20px] bg-card p-7 sm:p-8 {plan.featured ? 'ring-2 ring-primary/60' : 'border border-border'}">
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2.5">
            <h2 class="text-[22px] font-bold text-heading">{plan.name}</h2>
            {#if plan.featured}<span class="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">Most people</span>{/if}
          </div>
          <p class="text-[15px] text-muted-foreground">{plan.blurb}</p>
        </div>
        <div class="flex flex-col gap-1">
          <div class="text-[40px] font-bold tracking-[-0.02em] text-heading">{plan.price}<span class="text-[17px] font-medium text-muted-foreground"> {plan.per}</span></div>
          {#if plan.yearly}<div class="text-sm text-muted-foreground">{plan.yearly}</div>{/if}
        </div>
        <ul class="flex flex-1 flex-col gap-3 text-[15px] leading-snug text-foreground/85">
          {#each plan.items as item (item)}
            <li class="flex items-start gap-2.5"><Check class="mt-0.5 size-[17px] shrink-0 text-success" strokeWidth={2.4} aria-hidden="true" />{item}</li>
          {/each}
        </ul>
        {#if plan.cta === "play"}
          <PlayBadge height={48} class="self-start" />
        {:else}
          <a href="#how" class="flex items-center justify-center rounded-lg px-4 py-3 font-semibold {plan.featured ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-foreground/15 text-foreground hover:bg-accent'}">Subscribe in the app</a>
        {/if}
      </div>
    {/each}
  </div>
</section>

<section id="how" class="scroll-mt-6 border-y border-border bg-sidebar px-4 py-20 sm:px-6">
  <div class="mx-auto flex max-w-[1120px] flex-col gap-8">
    <h2 class="text-[28px] font-bold tracking-[-0.03em] text-heading sm:text-[32px]">How subscribing works</h2>
    <ol class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {#each steps as step, i (step.title)}
        <li class="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-6">
          <span class="flex size-8 items-center justify-center rounded-full bg-accent font-bold text-heading">{i + 1}</span>
          <h3 class="text-lg font-semibold text-heading">{step.title}</h3>
          <p class="text-[15px] leading-relaxed text-muted-foreground">{step.text}</p>
        </li>
      {/each}
    </ol>
    <p class="text-sm text-muted-foreground">To cancel: {PLAY_CANCEL_PATH}.</p>
  </div>
</section>

<section class="px-4 py-20 sm:px-6">
  <div class="mx-auto flex max-w-[880px] flex-col gap-6">
    <h2 class="text-[28px] font-bold tracking-[-0.03em] text-heading sm:text-[32px]">Compare plans</h2>
    <div class="overflow-x-auto rounded-[14px] border border-border">
      <table class="w-full min-w-[560px] border-collapse text-[15px]">
        <thead>
          <tr class="bg-card text-left">
            <th scope="col" class="px-5 py-3.5"><span class="sr-only">Feature</span></th>
            {#each ["Free", "Pro", "Studio"] as col (col)}<th scope="col" class="w-[110px] px-5 py-3.5 font-semibold text-heading">{col}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as [label, ...cells] (label)}
            <tr class="border-t border-border">
              <th scope="row" class="px-5 py-3.5 text-left font-normal text-foreground">{label}</th>
              {#each cells as cell, ci (ci)}
                <td class="px-5 py-3.5">
                  {#if cell === true}<Check class="size-[18px] text-success" strokeWidth={2.4} aria-label="Included" />
                  {:else if cell === false}<Minus class="size-[18px] text-muted-foreground/60" aria-label="Not included" />
                  {:else}<span class="text-sm text-foreground/85">{cell}</span>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-border bg-card p-6">
      <div class="min-w-0 flex-[1_1_400px]">
        <h3 class="mb-1.5 text-lg font-semibold text-heading">Rather run it yourself?</h3>
        <p class="text-[15px] leading-relaxed text-muted-foreground">Self-host the server and you get sync and the dashboard for free, on your own hardware.</p>
      </div>
      <a href="/self-hosting" class="font-semibold text-foreground underline-offset-4 hover:underline">Self-hosting guide →</a>
    </div>
  </div>
</section>

<section class="px-4 pb-24 sm:px-6">
  <div class="mx-auto grid max-w-[880px] gap-x-10 gap-y-7 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
    {#each faq as item (item.q)}
      <div><h3 class="mb-2 text-[17px] font-semibold text-heading">{item.q}</h3><p class="text-[15px] leading-relaxed text-muted-foreground">{item.a}</p></div>
    {/each}
  </div>
</section>
