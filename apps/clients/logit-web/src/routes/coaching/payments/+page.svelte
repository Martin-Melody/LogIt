<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import type { PaymentsOverview } from "@logit/core/domain/coachPayments";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import PaymentClients from "$lib/features/coaching/payments/PaymentClients.svelte";
  import PaymentSetup from "$lib/features/coaching/payments/PaymentSetup.svelte";

  // Coaching › Payments. Clients pay the coach directly through the coach's own Stripe
  // account, on the web (invite link). Two tabs: who's paid, and packages + settings.

  let data = $state<PaymentsOverview | null>(null);
  let error = $state<string | null>(null);

  const tab = $derived(page.url.searchParams.get("tab") === "setup" ? "setup" : "clients");

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
      void goto("/coaching/payments?tab=setup", { replaceState: true });
    }
    await load();
    if (back === "return" && data?.account.ready) toast.success("Stripe is connected. Make a package and put it on an invite link.");
  });

  function stripeUrls() {
    const base = `${location.origin}/coaching/payments?tab=setup&stripe=`;
    return { returnUrl: base + "return", refreshUrl: base + "refresh" };
  }

  function setTab(t: "clients" | "setup") {
    void goto(t === "setup" ? "?tab=setup" : "?", { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Payments</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">Clients pay you directly through your Stripe account. LogIt takes no cut.</p>
    </div>
    {#if data?.account.connected}
      <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener" class="inline-flex h-[34px] items-center rounded-[9px] border border-border px-3 text-[13px] font-medium hover:bg-muted">Open Stripe dashboard ↗</a>
    {/if}
  </header>

  <div role="tablist" aria-label="Payments" data-guide="payments-tabs" class="flex gap-[22px] border-b border-border">
    <button type="button" role="tab" aria-selected={tab === "clients"} onclick={() => setTab("clients")}
      class="-mb-px h-[34px] border-b-2 px-1 text-sm {tab === 'clients' ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground'}">Clients</button>
    <button type="button" role="tab" aria-selected={tab === "setup"} onclick={() => setTab("setup")}
      class="-mb-px h-[34px] border-b-2 px-1 text-sm {tab === 'setup' ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground'}">Packages and settings</button>
  </div>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !data}
    <Skeleton class="h-24" /><Skeleton class="h-64" />
  {:else if !data.configured}
    <Alert.Root><Alert.Description>Payments aren't switched on for this server yet. You can still mark clients as paid elsewhere.</Alert.Description></Alert.Root>
    {#if tab === "clients"}<PaymentClients {data} reload={load} onsetup={() => setTab("setup")} />{/if}
  {:else if tab === "clients"}
    <PaymentClients {data} reload={load} onsetup={() => setTab("setup")} />
  {:else}
    <PaymentSetup {data} reload={load} {stripeUrls} onclients={() => setTab("clients")} />
  {/if}
</div>
