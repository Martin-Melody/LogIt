<!-- W5 · Where a Free account on getlogit.app lands on the web (replaces "The dashboard comes
     with Pro and Studio"). The phone is the main path; Pro is shown with sample data, not just
     described; coaches can try the coaching space with sample clients. Plans are sold in the
     Android app (Google Play); web checkout only shows when the server turns it on. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { sandbox } from "$lib/features/guide/sandbox.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Alert from "$lib/components/ui/alert";
  import GetTheApp from "$lib/features/onboarding/GetTheApp.svelte";
  import UsersIcon from "@lucide/svelte/icons/users";
  import { adminState } from "$lib/features/admin/adminState.svelte";

  const user = $derived(apiClient.getUser());
  const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
  const PRICING_URL = `${MARKETING_URL}/pricing`;

  let webCheckout = $state(false);
  let checkoutLoading = $state<"pro" | "studio" | null>(null);
  let checkoutError = $state<string | null>(null);
  let coachBusy = $state(false);

  onMount(async () => {
    try {
      webCheckout = (await apiClient.getBillingStatus()).webCheckout === true;
    } catch {
      // Stay on the app-only wording.
    }
  });

  async function upgrade(plan: "pro" | "studio") {
    checkoutLoading = plan;
    checkoutError = null;
    try {
      const url = await apiClient.createCheckoutSession(`${location.origin}/`, `${location.origin}/upgrade`, plan);
      location.href = url;
    } catch (e) {
      checkoutError = e instanceof ApiError ? e.message : "Couldn't start checkout.";
      checkoutLoading = null;
    }
  }

  async function tryCoaching() {
    coachBusy = true;
    await sandbox.refresh();
    if (!sandbox.on) await sandbox.add();
    if (sandbox.on) await goto("/coaching");
    else {
      checkoutError = sandbox.error ?? "Couldn't add the sample clients. Try again.";
      coachBusy = false;
    }
  }

  function logout() {
    void apiClient.logout().then(() => goto("/login"));
  }

  // A made-up trend for the Pro preview, clearly labelled as sample data.
  const SAMPLE_TREND = "0,42 30,38 60,33 90,30 120,22 160,12";
</script>


<div class="flex min-h-screen flex-col items-center gap-7 bg-background px-6 pb-10 pt-14">
  <div class="flex w-full max-w-[1040px] flex-col gap-2">
    <p class="text-sm text-muted-foreground">Account ready · @{user?.username} · Free</p>
    <h1 class="text-[32px] font-bold leading-tight tracking-tight">Your training starts on your phone</h1>
    <p class="max-w-[70ch] text-[15px] text-muted-foreground">Logging happens in the gym, so LogIt lives on your phone. Your account is ready there too.</p>
    {#if adminState.isAdmin}
      <Button href="/admin" variant="outline" class="mt-2 w-fit">Open the admin console</Button>
    {/if}
  </div>

  <div class="flex w-full max-w-[1040px] flex-wrap items-stretch gap-5">
    <div class="flex min-w-0 flex-[1_1_380px]">
      <GetTheApp>
        <span class="text-[13px] text-slate-400">Already free: Social, getting coached, and backup of one phone.</span>
      </GetTheApp>
    </div>

    <section class="flex min-w-0 flex-[1.3_1_420px] flex-col gap-3.5 rounded-2xl border border-border bg-card p-6">
      <div class="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2 class="text-lg font-bold">What Pro adds here</h2>
        <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Sample data</span>
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        <div class="flex flex-col gap-1.5 rounded-[10px] border border-border p-3">
          <span class="text-[13px] font-semibold">Estimated max</span>
          <svg viewBox="0 0 160 50" class="h-[50px] w-full" role="img" aria-label="A sample estimated max rising over 12 weeks">
            <polyline points={SAMPLE_TREND} fill="none" stroke="currentColor" stroke-width="2.5" />
          </svg>
        </div>
        <div class="flex flex-col gap-1.5 rounded-[10px] border border-border p-3">
          <span class="text-[13px] font-semibold">Plan your week</span>
          <span class="text-xs text-muted-foreground">Drag days, swap exercises, see sets per muscle add up</span>
        </div>
        <div class="flex flex-col gap-1.5 rounded-[10px] border border-border p-3">
          <span class="text-[13px] font-semibold">Every device in sync</span>
          <span class="text-xs text-muted-foreground">Phone, tablet and here, always the same</span>
        </div>
      </div>

      {#if webCheckout}
        <div class="flex flex-wrap gap-2">
          <Button disabled={checkoutLoading !== null} onclick={() => void upgrade("pro")}>
            {checkoutLoading === "pro" ? "Starting…" : "Upgrade to Pro"}
          </Button>
          <Button variant="outline" disabled={checkoutLoading !== null} onclick={() => void upgrade("studio")}>
            {checkoutLoading === "studio" ? "Starting…" : "Upgrade to Studio"}
          </Button>
        </div>
      {:else}
        <p class="text-sm leading-relaxed text-muted-foreground">
          To get Pro, open LogIt on your Android phone, signed in as <span class="font-medium text-foreground">@{user?.username}</span>, and go to
          Settings › Account › See plans. Google Play takes the payment, and this dashboard opens straight after.
        </p>
      {/if}
      <a href={PRICING_URL} class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Compare plans</a>
    </section>
  </div>

  <section class="flex w-full max-w-[1040px] flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-border p-5">
    <div class="flex min-w-0 items-center gap-3.5">
      <UsersIcon class="size-6 shrink-0" aria-hidden="true" />
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[15px] font-semibold">Coach people?</span>
        <span class="text-[13px] text-muted-foreground">Try the coaching space with sample clients. Inviting real clients comes with Studio.</span>
      </div>
    </div>
    <Button variant="outline" disabled={coachBusy} onclick={() => void tryCoaching()}>{coachBusy ? "Setting up…" : "Try it with sample clients"}</Button>
  </section>

  {#if checkoutError}
    <Alert.Root variant="destructive" class="w-full max-w-[1040px]"><Alert.Description>{checkoutError}</Alert.Description></Alert.Root>
  {/if}

  <p class="text-xs text-muted-foreground">
    Signed in as <span class="font-medium text-foreground">@{user?.username}</span> ·
    <a href="/account" class="underline hover:text-foreground">Account</a> ·
    <button type="button" class="underline hover:text-foreground" onclick={logout}>Log out</button>
  </p>
</div>
