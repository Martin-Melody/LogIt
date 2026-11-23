<script lang="ts">
  // "I coach people" from the goal screen (design canvas C1): what a coach's day looks like,
  // then set up coaching. Coaching clients is the Studio plan (everything is included on a
  // self-hosted server); it needs an account first. "I train too" (on) carries on to the
  // normal goal → plan steps afterwards.
  import { goto } from "$app/navigation";
  import { ArrowLeft, Clock, MessageSquare, Monitor, Share } from "lucide-svelte";
  import { apiClient } from "@logit/core/api/client";
  import { getServerMode } from "@logit/core/api/serverConfig";
  import { authStore } from "$lib/api/authStore.svelte";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { resetTours } from "$lib/tour/index";

  const HERE = "/onboarding/coaching";
  let trainToo = $state(true);

  // Said before the account is made, not after (bug hunt 4.7). A self-hosted server includes everything.
  const ownServer = $derived(authStore.isAuthenticated ? apiClient.isSelfHosted() : getServerMode() === "selfhosted");
  const hasStudio = $derived(authStore.user?.tier === "Studio" || (authStore.isAuthenticated && apiClient.isSelfHosted()));

  async function setUp() {
    if (!authStore.isAuthenticated) {
      await goto(`/auth?mode=register&redirect=${encodeURIComponent(HERE)}`);
      return;
    }
    if (!hasStudio) {
      await goto("/plans");
      return;
    }
    if (trainToo) {
      onboarding.setStep(1);
      await goto("/onboarding");
      return;
    }
    resetTours();
    onboarding.complete();
    await goto("/clients");
  }

  const POINTS = [
    { icon: Clock, title: "Who needs you today", text: "Missed sessions, overdue check-ins, new PRs, in one list" },
    { icon: MessageSquare, title: "Check-ins and messages", text: "Reply between your own sets" },
    { icon: Share, title: "Invite clients anywhere", text: "Send your link on WhatsApp, or show a QR code at the gym" },
    { icon: Monitor, title: "Programs and payments on a computer", text: "Build blocks on a big screen; they land on clients' phones" },
  ];
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-7">
  <div class="flex items-center min-h-11">
    <button type="button" class="flex items-center gap-1 min-h-11 text-sm text-muted-foreground" onclick={() => { onboarding.setStep(1); void goto("/onboarding"); }}>
      <ArrowLeft class="h-4 w-4" /> Back
    </button>
  </div>
  <h1 class="mt-4 mb-1.5 text-[26px] font-bold leading-tight">Coach from your pocket</h1>
  <p class="mb-6 text-[15px] text-muted-foreground">Your clients train with LogIt. You see it as it happens.</p>

  <ul class="flex flex-col gap-4">
    {#each POINTS as p (p.title)}
      <li class="flex items-start gap-3.5">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted"><p.icon class="h-[18px] w-[18px]" /></span>
        <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">{p.title}</span><span class="text-sm text-muted-foreground">{p.text}</span></span>
      </li>
    {/each}
  </ul>

  <div class="flex-1 min-h-6"></div>
  {#if !hasStudio && !ownServer}
    <p class="mb-2 text-[13px] text-muted-foreground">
      Coaching clients is the Studio plan{authStore.isAuthenticated ? "." : ". Making the account is free; Studio comes after."}
    </p>
  {/if}
  <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold" onclick={() => void setUp()}>
    {!authStore.isAuthenticated ? "Make an account to coach" : hasStudio ? "Set up my coaching" : "See the Studio plan"}
  </button>
  <label class="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted px-3.5 py-3">
    <span class="flex flex-col">
      <span class="text-[15px] font-medium">I train too</span>
      <span class="text-[13px] text-muted-foreground">Set up my own plan afterwards</span>
    </span>
    <input type="checkbox" class="h-[22px] w-[22px] accent-primary" bind:checked={trainToo} />
  </label>
</div>
