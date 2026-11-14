<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Check, Cloud, Monitor, CalendarDays, UserRound, UserPlus, RefreshCw, Clock, Loader2 } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import BillingSheet from "$lib/components/billing/BillingSheet.svelte";
  import { Button } from "$lib/components/ui/button";
  import { back } from "$lib/navigation";
  import { authStore } from "$lib/api/authStore.svelte";
  import { apiClient } from "@logit/core/api/client";
  import { billing, type BuyOutcome } from "$lib/billing/billing.svelte";
  import { hasPlayBilling } from "$lib/billing/playBilling";
  import {
    PRODUCT_IDS, formatDay, pickOffer, recurringPhase, trialText, yearlySaving,
    type PaidPlan, type Period,
  } from "$lib/billing/plans";
  import { PRIVACY_URL, TERMS_URL } from "$lib/constants/urls";

  const PLANS: { id: PaidPlan; blurb: string; items: string[] }[] = [
    {
      id: "Pro",
      blurb: "For training across devices",
      items: [
        "Backup and sync between your devices",
        "The web dashboard at app.getlogit.app",
        "Deeper charts: e1RM, volume, nutrition against performance",
      ],
    },
    {
      id: "Studio",
      blurb: "For personal trainers and coaches",
      items: [
        "Everything in Pro",
        "Invite clients; you see nothing until they accept",
        "Programs, macro targets, check-ins and messages",
      ],
    },
  ];

  const canBuy = hasPlayBilling();
  const selfHosted = $derived(authStore.isAuthenticated && apiClient.isSelfHosted());

  let plan = $state<PaidPlan>(page.url.searchParams.get("plan") === "studio" ? "Studio" : "Pro");
  let period = $state<Period>("monthly");
  let outcome = $state<BuyOutcome | null>(null);
  let restoreNote = $state<string | null>(null);
  let restoring = $state(false);

  const product = (p: PaidPlan) => billing.products.find((x) => x.productId === PRODUCT_IDS[p]);
  const priceOf = (p: PaidPlan, per: Period) => recurringPhase(pickOffer(product(p), per))?.formattedPrice ?? null;
  const saving = $derived(yearlySaving(product("Pro")));
  const offer = $derived(pickOffer(product(plan), period));
  const price = $derived(priceOf(plan, period));
  const trial = $derived(trialText(offer));
  const perWord = $derived(period === "yearly" ? "year" : "month");

  // What they have now, so the button can say "Current plan" or "Switch to Studio".
  const current = $derived(
    billing.status?.subscription?.grantsAccess && billing.status.subscription.source === "google"
      ? billing.status.subscription
      : null,
  );
  const isCurrent = $derived(current?.productId === PRODUCT_IDS[plan]);
  const ctaLabel = $derived(
    isCurrent ? "Your current plan"
      : current ? `Switch to ${plan}`
      : trial ? `Start free trial`
      : `Subscribe to ${plan}`,
  );

  onMount(() => {
    void billing.refreshStatus();
    void billing.loadProducts();
  });

  async function subscribe() {
    outcome = await billing.buy(plan, period);
  }

  async function restore() {
    restoring = true;
    restoreNote = null;
    if (!billing.onHostedAccount()) {
      restoring = false;
      outcome = { kind: "needAccount" };
      return;
    }
    const r = await billing.restore();
    restoring = false;
    if (r.otherAccount) outcome = { kind: "otherAccount" };
    else if (r.restored) restoreNote = "Your plan is restored.";
    else if (r.failed) restoreNote = "Couldn't check with Google Play. Try again in a moment.";
    else restoreNote = "No subscriptions found on this Google account.";
  }

  function closeSheet() {
    outcome = null;
  }

  const segClass = (on: boolean) =>
    `h-9 rounded-lg text-[13px] font-semibold transition-colors ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`;
</script>

{#if outcome?.kind === "success"}
  <!-- After paying -->
  <div class="flex min-h-[calc(100dvh-8rem)] flex-col px-4 pb-24">
    <div class="flex flex-1 flex-col items-center justify-center gap-3.5 px-2 text-center">
      <div class="flex size-16 items-center justify-center rounded-full bg-success/15">
        <Check class="size-7 text-success" strokeWidth={2.4} />
      </div>
      <h1 class="text-2xl font-bold tracking-tight">You're on {outcome.plan}</h1>
      <p class="text-sm leading-relaxed text-muted-foreground">Thanks for supporting LogIt. Sync is on, and your training is backing up now.</p>
      <div class="mt-3.5 w-full divide-y divide-border rounded-[10px] border border-border bg-card text-left">
        <div class="flex gap-3 p-3.5">
          <Cloud class="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
          <span class="flex flex-col gap-0.5"><span class="text-sm font-medium">Backing up your training</span><span class="text-xs text-muted-foreground">Sign in on another phone and it's there.</span></span>
        </div>
        <div class="flex gap-3 p-3.5">
          <Monitor class="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
          <span class="flex flex-col gap-0.5"><span class="text-sm font-medium">The dashboard is open to you</span><span class="text-xs text-muted-foreground">app.getlogit.app, same username and password.</span></span>
        </div>
        {#if billing.status?.subscription?.expiresAt}
          <div class="flex gap-3 p-3.5">
            <CalendarDays class="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
            <span class="flex flex-col gap-0.5"><span class="text-sm font-medium">Renews {formatDay(billing.status.subscription.expiresAt)}</span><span class="text-xs text-muted-foreground">Change or cancel any time in Settings › Account.</span></span>
          </div>
        {/if}
      </div>
    </div>
    <Button size="lg" class="w-full" onclick={() => void goto("/settings")}>Done</Button>
  </div>
{:else}
  <div class="flex flex-col gap-3.5 px-4 pb-24">
    <PageHeader>
      <BackButton onclick={() => back("/settings")} />
      <h1 class="page-title">Plans</h1>
    </PageHeader>

    {#if selfHosted}
      <p class="rounded-[10px] border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
        You're on your own server, so sync, the dashboard and coaching are all on. Plans only apply to getlogit.app.
      </p>
    {:else}
      <p class="text-sm leading-relaxed text-muted-foreground">
        The whole app stays free. A plan adds sync between your devices and the web dashboard, or coaching clients.
      </p>

      <div role="radiogroup" aria-label="Billing period" class="grid grid-cols-2 gap-1 rounded-[10px] bg-muted p-1">
        <button type="button" role="radio" aria-checked={period === "monthly"} class={segClass(period === "monthly")} onclick={() => (period = "monthly")}>Monthly</button>
        <button type="button" role="radio" aria-checked={period === "yearly"} class={segClass(period === "yearly")} onclick={() => (period = "yearly")}>
          Yearly{#if saving}<span class="ml-1 text-[11px] font-semibold {period === 'yearly' ? 'text-primary-foreground/70' : 'text-success'}">save {saving}%</span>{/if}
        </button>
      </div>

      <div role="radiogroup" aria-label="Plan" class="flex flex-col gap-2.5">
        {#each PLANS as p (p.id)}
          {@const on = plan === p.id}
          {@const amount = priceOf(p.id, period)}
          <button
            type="button"
            role="radio"
            aria-checked={on}
            class="flex flex-col items-start gap-1 rounded-[10px] border-[1.5px] bg-card px-3.5 pt-3.5 pb-4 text-left transition-colors {on ? 'border-primary' : 'border-border'}"
            onclick={() => (plan = p.id)}
          >
            <span class="flex w-full items-baseline justify-between gap-2">
              <span class="flex items-center gap-2 text-base font-semibold">
                {p.id}
                {#if current?.productId === PRODUCT_IDS[p.id]}<span class="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Current</span>{/if}
              </span>
              {#if amount}
                <span class="text-[15px] font-semibold">{amount}<span class="text-xs font-normal text-muted-foreground"> / {perWord}</span></span>
              {:else if billing.productsState === "loading"}
                <span class="h-4 w-16 animate-pulse rounded bg-muted" aria-label="Loading price"></span>
              {/if}
            </span>
            <span class="text-[13px] text-muted-foreground">{p.blurb}</span>
            <span class="mt-1 flex flex-col gap-1.5">
              {#each p.items as item (item)}
                <span class="flex gap-2 text-[13px]"><Check class="mt-px size-4 shrink-0 text-success" strokeWidth={2.4} />{item}</span>
              {/each}
            </span>
          </button>
        {/each}
      </div>

      <div class="mt-1 flex flex-col gap-2.5 border-t border-border pt-3.5">
        {#if !canBuy}
          <p class="text-center text-sm text-muted-foreground">Plans are bought in the LogIt Android app, through Google Play.</p>
        {:else}
          {#if billing.productsState === "error"}
            <p class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              Couldn't load prices from Google Play.
              <button type="button" class="font-semibold text-foreground underline underline-offset-4" onclick={() => void billing.loadProducts()}>Retry</button>
            </p>
          {/if}
          <Button size="lg" class="w-full text-[15px] font-semibold" disabled={billing.busy || (billing.onHostedAccount() && (!offer || isCurrent))} onclick={() => void subscribe()}>
            {#if billing.busy}<Loader2 class="animate-spin" />Confirming with Google Play…{:else}{ctaLabel}{/if}
          </Button>
          {#if price}
            <p class="text-center text-[11.5px] leading-normal text-muted-foreground">
              {#if trial}{trial}, then {price} a {perWord}.{:else}{plan} is {price} a {perWord}.{/if}
              Paid through Google Play; renews every {perWord} until you cancel. Cancel any time in Google Play › Payments and subscriptions; you keep the plan until the period ends.
            </p>
          {/if}
        {/if}
        <div class="flex justify-center gap-1 text-xs">
          {#if canBuy}
            <button type="button" class="px-2 py-1.5 underline-offset-4 hover:underline disabled:opacity-50" disabled={restoring} onclick={() => void restore()}>
              {restoring ? "Checking…" : "Restore purchases"}
            </button>
          {/if}
          <a class="px-2 py-1.5 underline-offset-4 hover:underline" href={TERMS_URL} target="_blank" rel="noopener">Terms</a>
          <a class="px-2 py-1.5 underline-offset-4 hover:underline" href={PRIVACY_URL} target="_blank" rel="noopener">Privacy</a>
        </div>
        {#if restoreNote}<p class="text-center text-xs text-muted-foreground" role="status">{restoreNote}</p>{/if}
      </div>
    {/if}
  </div>
{/if}

<!-- Account needed -->
<BillingSheet open={outcome?.kind === "needAccount"} title="Make a free account first" onclose={closeSheet}>
  {#snippet icon()}<UserRound class="size-[22px]" />{/snippet}
  <p class="text-sm leading-relaxed text-muted-foreground">
    Your plan belongs to your LogIt account, so it follows you to a new phone and to the web dashboard. Nothing leaves this phone until you turn sync on.
  </p>
  <div class="mt-2 flex flex-col gap-2">
    <Button size="lg" class="w-full" onclick={() => void goto("/auth?mode=register&redirect=/plans")}>Create account</Button>
    <Button size="lg" variant="outline" class="w-full" onclick={() => void goto("/auth?redirect=/plans")}>I already have one</Button>
    <Button variant="ghost" class="w-full text-muted-foreground" onclick={closeSheet}>Not now</Button>
  </div>
</BillingSheet>

<!-- Bought for another LogIt account -->
<BillingSheet open={outcome?.kind === "otherAccount"} title="This plan is on another account" tone="warning" onclose={closeSheet}>
  {#snippet icon()}<UserPlus class="size-[22px]" />{/snippet}
  <p class="text-sm leading-relaxed text-muted-foreground">
    The subscription on this Google account belongs to a different LogIt account. Sign in to that account to use it. You're signed in as
    <strong class="text-foreground">@{authStore.user?.username}</strong>.
  </p>
  <div class="mt-2 flex flex-col gap-2">
    <Button size="lg" class="w-full" onclick={() => void authStore.logout()}>Switch account</Button>
    <Button variant="ghost" class="w-full text-muted-foreground" onclick={closeSheet}>Close</Button>
  </div>
</BillingSheet>

<!-- Paid, server didn't confirm yet -->
<BillingSheet open={outcome?.kind === "unverified"} title="Almost there" tone="info" onclose={closeSheet}>
  {#snippet icon()}<RefreshCw class="size-[22px]" />{/snippet}
  <p class="text-sm leading-relaxed text-muted-foreground">
    Your payment went through, but we couldn't finish switching {plan} on. You won't be charged twice. We'll keep trying, or try now.
  </p>
  <div class="mt-2 flex flex-col gap-2">
    <Button size="lg" class="w-full" disabled={restoring} onclick={async () => { outcome = null; await restore(); if (billing.status?.subscriptionActive) outcome = { kind: "success", plan }; }}>Try again</Button>
    <Button variant="ghost" class="w-full text-muted-foreground" onclick={closeSheet}>Later</Button>
  </div>
</BillingSheet>

<!-- Payment pending -->
<BillingSheet open={outcome?.kind === "pending"} title="Waiting for your payment" onclose={closeSheet}>
  {#snippet icon()}<Clock class="size-[22px]" />{/snippet}
  <p class="text-sm leading-relaxed text-muted-foreground">
    Google Play is still waiting for the payment to clear. {plan} starts as soon as it does; you don't need to keep the app open.
  </p>
  <div class="mt-2 flex flex-col gap-2">
    <Button size="lg" class="w-full" onclick={closeSheet}>OK</Button>
  </div>
</BillingSheet>

<!-- Couldn't start -->
<BillingSheet open={outcome?.kind === "error"} title="That didn't work" onclose={closeSheet}>
  {#snippet icon()}<RefreshCw class="size-[22px]" />{/snippet}
  <p class="text-sm leading-relaxed text-muted-foreground">{outcome?.kind === "error" ? outcome.message : ""} You haven't been charged.</p>
  <div class="mt-2 flex flex-col gap-2">
    <Button size="lg" class="w-full" onclick={closeSheet}>OK</Button>
  </div>
</BillingSheet>
