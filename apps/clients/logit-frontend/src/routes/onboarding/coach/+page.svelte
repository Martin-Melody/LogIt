<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  // "I have a coach" from the goal screen (design canvas C3). Coaching needs an account (a
  // free one is enough), so without one this asks for that first and comes back. Then the
  // coach's code (or their QR), their card as soon as it's recognised, what they may see,
  // and connect. No goal or plan questions: the coach's program covers them.
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft, ScanLine } from "lucide-svelte";
  import { ApiError } from "@logit/core/api/client";
  import { coachApi, SHARE_ALL, type InviteLinkInfo, type Sharing } from "@logit/core/api/coachApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { get } from "svelte/store";
  import { back } from "$lib/navigation";
  import { resetTours } from "$lib/tour/index";
  import { isNativePlatform } from "$lib/platform/isNative";
  import SharingList from "$lib/components/coaching/SharingList.svelte";
  import { codeFromInvite } from "$lib/features/onboarding/coachCode";

  const WEB_URL = import.meta.env.VITE_WEB_URL || "https://app.getlogit.app";
  const HERE = "/onboarding/coach";

  let code = $state("");
  let info = $state<InviteLinkInfo | null>(null);
  let looking = $state(false);
  let lookupError = $state<string | null>(null);
  let sharing = $state<Sharing>({ ...SHARE_ALL });
  let sending = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const coachName = $derived(info ? info.coach.displayName || info.coach.username : "");
  const paid = $derived(!!info?.package);

  onMount(() => {
    const fromLink = new URLSearchParams(location.search).get("code");
    if (fromLink) {
      code = fromLink.toUpperCase();
      void lookup();
    }
  });

  function typed() {
    info = null;
    lookupError = null;
    if (timer) clearTimeout(timer);
    if (code.replace(/[^A-Za-z0-9]/g, "").length < 4) return;
    timer = setTimeout(() => void lookup(), 500);
  }

  async function lookup() {
    const c = code.trim();
    if (!c) return;
    looking = true;
    try {
      const found = await coachApi.openLink(c);
      if (c === code.trim()) info = found;
    } catch (e) {
      lookupError = e instanceof ApiError && e.status === 404 ? "No coach with that code. Check it on their invite." : "Couldn't check the code. Try again.";
    } finally {
      looking = false;
    }
  }

  async function scan() {
    try {
      const { scanQrNative } = await import("$lib/features/nutrition/barcodeScan");
      const raw = await scanQrNative();
      const c = raw ? codeFromInvite(raw) : null;
      if (c) {
        code = c;
        await lookup();
      }
    } catch (e) {
      lookupError = e instanceof Error && e.message === "scanner-preparing" ? "The scanner is getting ready. Try again in a moment." : "Couldn't scan. Type the code instead.";
    }
  }

  async function connect() {
    if (!info || sending) return;
    sending = true;
    error = null;
    try {
      if (info.relationship === "invited" && info.relationshipId) await coachApi.acceptInvite(info.relationshipId, sharing);
      else if (info.relationship === "none" || info.relationship === "paused") await coachApi.requestCoaching(code.trim(), sharing);
      resetTours();
      onboarding.complete();
      await goto("/clients");
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't connect. Try again.";
      sending = false;
    }
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-7">
  <div class="flex items-center min-h-11">
    <button type="button" class="flex items-center gap-1 min-h-11 text-sm text-muted-foreground" onclick={() => { if (get(onboarding).completed) { back("/clients"); return; } onboarding.setStep(1); void goto("/onboarding"); }}>
      <ArrowLeft class="h-4 w-4" /> Back
    </button>
  </div>
  <h1 class="mt-4 mb-1.5 text-[26px] font-bold leading-tight">Connect with your coach</h1>
  <p class="mb-6 text-[15px] text-muted-foreground">Their program, check-ins and messages come straight to you.</p>

  {#if !authStore.isAuthenticated}
    <p class="mb-4 text-sm text-muted-foreground">Coaching works on a free account. Make one first, then enter your coach's code.</p>
    <div class="flex flex-col gap-2.5">
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold" onclick={() => goto(`/auth?mode=register&redirect=${encodeURIComponent(HERE)}`)}>
        Create a free account
      </button>
      <button type="button" class="h-12 rounded-[10px] border border-border text-[15px] font-medium" onclick={() => goto(`/auth?mode=login&redirect=${encodeURIComponent(HERE)}`)}>
        I have an account
      </button>
    </div>
  {:else}
    <div class="flex flex-col gap-1.5">
      <label for="coach-code" class="text-sm font-medium">Coach's code</label>
      <input id="coach-code" type="text" autocapitalize="characters" autocomplete="off" bind:value={code} oninput={typed}
        class="h-[52px] rounded-[10px] border-2 border-primary bg-background px-3.5 text-lg font-semibold tracking-widest focus:outline-none" />
      <span class="text-[13px] text-muted-foreground">It's on the invite they sent you.</span>
    </div>

    {#if isNativePlatform()}
      <div class="my-4 flex items-center gap-2.5 text-[13px] text-muted-foreground"><span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span></div>
      <button type="button" class="flex h-12 items-center justify-center gap-2.5 rounded-[10px] border border-border text-[15px] font-semibold" onclick={() => void scan()}>
        <ScanLine class="h-[18px] w-[18px]" /> Scan your coach's QR code
      </button>
    {/if}

    {#if looking}
      <p class="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="h-4 w-4" /> Checking…</p>
    {:else if lookupError}
      <p class="mt-5 text-sm text-destructive">{lookupError}</p>
    {:else if info}
      <div class="mt-5 flex flex-col gap-2 rounded-xl bg-muted p-3.5">
        <span class="flex items-center gap-2.5">
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-muted-foreground/15 font-bold">{coachName.slice(0, 1).toUpperCase()}</span>
          <span class="flex flex-col"><span class="text-[15px] font-semibold">{coachName}</span><span class="text-[13px] text-muted-foreground">@{info.coach.username}</span></span>
        </span>
        {#if info.isSelf}
          <span class="text-[13px] text-muted-foreground">That's your own code.</span>
        {:else if info.relationship === "active"}
          <span class="text-[13px] text-muted-foreground">{coachName} is already your coach.</span>
        {:else if info.relationship === "requested"}
          <span class="text-[13px] text-muted-foreground">Your request is with {coachName}.</span>
        {:else if paid}
          <span class="text-[13px] text-muted-foreground">{coachName}'s coaching is paid. Payment happens on the web, then everything comes to this app.</span>
        {:else if info.state !== "active" && info.relationship !== "invited"}
          <span class="text-[13px] text-muted-foreground">This code isn't taking new clients. Ask {coachName} for a new one.</span>
        {:else}
          <span class="text-[13px] text-muted-foreground">{coachName} will see what you switch on below. Change it any time in My coach.</span>
        {/if}
      </div>
      {#if !info.isSelf && !paid && (info.relationship === "none" || info.relationship === "invited" || info.relationship === "paused") && (info.state === "active" || info.relationship === "invited")}
        <p class="mt-4 mb-1 text-[13px] font-semibold">What {coachName} can see</p>
        <SharingList {sharing} disabled={sending} onchange={(s) => (sharing = s)} />
      {/if}
    {/if}

    <div class="flex-1 min-h-6"></div>
    {#if error}<p class="mb-2 text-sm text-destructive" role="alert">{error}</p>{/if}
    {#if info && paid && !info.isSelf && info.relationship !== "active"}
      <a href="{WEB_URL}/c/{encodeURIComponent(code.trim())}" target="_blank" rel="noopener"
        class="flex h-[52px] items-center justify-center rounded-[10px] bg-primary text-base font-semibold text-primary-foreground">Pay on the web</a>
    {:else if info && (info.relationship === "active" || info.relationship === "requested")}
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold"
        onclick={() => { resetTours(); onboarding.complete(); void goto("/clients"); }}>Open My coach</button>
    {:else}
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        disabled={!info || info.isSelf || sending || (info.state !== "active" && info.relationship !== "invited")} onclick={() => void connect()}>
        {#if sending}<Spinner class="h-4 w-4" />{/if}
        {info && !info.isSelf ? (info.relationship === "invited" ? `Accept ${coachName} as my coach` : `Connect with ${coachName}`) : "Connect"}
      </button>
    {/if}
  {/if}
</div>
