<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { formatMoney, type PaymentsOverview } from "@logit/core/domain/coachPayments";
  import { Button } from "$lib/components/ui/button";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import PaymentClients from "$lib/features/coaching/payments/PaymentClients.svelte";
  import PaymentPackages from "$lib/features/coaching/payments/PaymentPackages.svelte";
  import PaymentSettings from "$lib/features/coaching/payments/PaymentSettings.svelte";

  // Coaching › Payments. Clients pay the coach directly through the coach's own Stripe
  // account, on the web. Three tabs (canvas K10): Clients (who pays what), Packages, Settings.
  type Tab = "clients" | "packages" | "settings";

  let data = $state<PaymentsOverview | null>(null);
  let error = $state<string | null>(null);

  // "setup" is the old name for Packages (links in emails and Stripe's return).
  const tab = $derived.by((): Tab => {
    const t = page.url.searchParams.get("tab");
    return t === "settings" ? "settings" : t === "packages" || t === "setup" ? "packages" : "clients";
  });
  let newPackage = $state(page.url.searchParams.get("new") === "1");

  async function load() {
    try {
      data = await coachPaymentsApi.overview();
      coachBadges.setPayments(data.summary.problems);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load payments";
    }
  }

  onMount(async () => {
    const back = page.url.searchParams.get("stripe");
    if (back === "refresh") {
      // Stripe's setup link expired: get a fresh one and go straight back.
      try {
        const { url } = await coachPaymentsApi.connect({ country: "ie", ...stripeUrls() });
        location.href = url;
        return;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't reopen Stripe");
      }
    }
    if (back === "return") {
      try { await coachPaymentsApi.refresh(); } catch { /* the overview shows the state anyway */ }
      void goto("/coaching/payments?tab=packages", { replaceState: true });
    }
    await load();

  });

  function stripeUrls() {
    const base = `${location.origin}/coaching/payments?tab=packages&stripe=`;
    return { returnUrl: base + "return", refreshUrl: base + "refresh" };
  }

  function setTab(t: Tab) {
    void goto(t === "clients" ? "?" : `?tab=${t}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
  const monthName = new Date().toLocaleDateString(undefined, { month: "long" });
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Payments</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">
        {#if data?.account.ready && data.summary.monthCents > 0}{formatMoney(data.summary.monthCents, data.summary.currency)} paid to you in {monthName} · before Stripe's fees
        {:else if data?.account.ready}Stripe connected as "{data.account.displayName ?? "your account"}". Clients pay you directly; LogIt takes no cut.
        {:else}Clients pay you directly through your Stripe account. LogIt takes no cut.{/if}
      </p>
    </div>
    {#if tab === "packages"}
      <Button onclick={() => (newPackage = true)}>New package</Button>
    {:else if data?.account.connected}
      <Button variant="outline" href="https://dashboard.stripe.com/" target="_blank" rel="noopener">Open Stripe dashboard ↗</Button>
    {/if}
  </header>

  <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
    <Tabs.List variant="line" aria-label="Payments" data-guide="payments-tabs">
      <Tabs.Trigger value="clients">Clients</Tabs.Trigger>
      <Tabs.Trigger value="packages">Packages</Tabs.Trigger>
      <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !data}
    <Skeleton class="h-24" /><Skeleton class="h-64" />
  {:else if !data.configured}
    <Alert.Root><Alert.Description>Payments aren't switched on for this server yet. You can still mark clients as paid elsewhere.</Alert.Description></Alert.Root>
    {#if tab === "clients"}<PaymentClients {data} reload={load} onsetup={() => setTab("packages")} />{/if}
  {:else if tab === "clients"}
    <PaymentClients {data} reload={load} onsetup={() => setTab("packages")} />
  {:else if tab === "packages"}
    <PaymentPackages {data} reload={load} {stripeUrls} onclients={() => setTab("clients")} bind:newOpen={newPackage} />
  {:else}
    <PaymentSettings {data} reload={load} {stripeUrls} />
  {/if}
</div>
