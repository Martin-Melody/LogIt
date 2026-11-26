<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { back } from "$lib/navigation";
  // Sign in on a computer (web onboarding W1, the phone side). The web sign-in page shows a QR;
  // this scans it, says which browser is asking, and only signs it in when the person says yes
  // (server Features/Auth/PairingEndpoints.cs). The question warns about the one thing the server
  // can't stop: approving a code someone else put in front of you.
  import { onDestroy, onMount } from "svelte";
  import { ArrowLeft, Check, Monitor, ScanLine, XCircle } from "lucide-svelte";
  import { apiClient, ApiError, PAIRING_QR_PREFIX, type SignedInSession } from "@logit/core/api/client";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { authStore } from "$lib/api/authStore.svelte";

  type Step =
    | { kind: "start" }
    | { kind: "looking" }
    | { kind: "ask"; code: string; device: string; expiresAtMs: number }
    | { kind: "answering"; device: string }
    | { kind: "done"; device: string; approved: boolean };

  let step = $state<Step>({ kind: "start" });
  let error = $state<string | null>(null);
  let typed = $state("");
  let now = $state(Date.now());
  let sessions = $state<SignedInSession[] | null>(null);
  const tick = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => clearInterval(tick));

  const native = isNativePlatform();
  const username = authStore.user?.username ?? apiClient.getUser()?.username ?? "";

  async function loadSessions() {
    try {
      sessions = await apiClient.listSessions();
    } catch {
      sessions = null;
    }
  }
  onMount(loadSessions);

  function expiredMessage(e: unknown): string {
    if (e instanceof ApiError && e.status === 410) return "That code has run out. Refresh the sign-in page on the computer and scan the new one.";
    if (e instanceof ApiError && e.status === 429) return "Too many tries. Wait a few minutes, then try again.";
    return e instanceof Error ? e.message : "Couldn't reach the server. Try again.";
  }

  async function lookUp(raw: string) {
    const text = raw.trim();
    if (!text.startsWith(PAIRING_QR_PREFIX)) {
      error = "That isn't a LogIt sign-in code. Scan the QR on the computer's sign-in page.";
      return;
    }
    error = null;
    step = { kind: "looking" };
    try {
      const found = await apiClient.lookUpPairing(text);
      step = { kind: "ask", code: text, device: found.device, expiresAtMs: Date.now() + found.secondsLeft * 1000 };
    } catch (e) {
      error = expiredMessage(e);
      step = { kind: "start" };
    }
  }

  async function scan() {
    error = null;
    try {
      const { scanQrNative } = await import("$lib/features/nutrition/barcodeScan");
      const raw = await scanQrNative();
      if (raw) await lookUp(raw);
    } catch (e) {
      error = e instanceof Error && e.message === "scanner-preparing"
        ? "The scanner is getting ready. Try again in a moment."
        : "Couldn't open the scanner. Check LogIt can use the camera.";
    }
  }

  async function answer(approve: boolean) {
    if (step.kind !== "ask") return;
    const { code, device } = step;
    step = { kind: "answering", device };
    try {
      await apiClient.answerPairing(code, approve);
      step = { kind: "done", device, approved: approve };
      if (approve) await loadSessions();
    } catch (e) {
      error = expiredMessage(e);
      step = { kind: "start" };
    }
  }

  const secondsLeft = $derived(step.kind === "ask" ? Math.max(0, Math.round((step.expiresAtMs - now) / 1000)) : 0);

  async function signOutSession(s: SignedInSession) {
    try {
      await apiClient.signOutSession(s.id);
      await loadSessions();
    } catch {
      error = "Couldn't sign that one out. Try again.";
    }
  }
</script>

<div class="mx-auto flex min-h-screen w-full max-w-sm flex-col bg-background px-6 pb-8 pt-10 text-foreground">
  <button type="button" class="mb-4 flex min-h-11 items-center gap-1.5 self-start text-sm text-muted-foreground" onclick={() => back("/settings")}>
    <ArrowLeft class="h-4 w-4" /> Settings
  </button>

  {#if step.kind === "ask" || step.kind === "answering"}
    <div class="flex flex-1 flex-col gap-5">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><Monitor class="h-7 w-7" /></div>
      <div>
        <h1 class="mb-1.5 text-[22px] font-bold">Sign in on {step.device}?</h1>
        <p class="text-sm text-muted-foreground">It will be signed in as <strong class="font-medium text-foreground">@{username}</strong>, with everything in your account.</p>
      </div>
      <div class="rounded-[10px] bg-warning/10 p-3.5 text-sm leading-relaxed">
        Only say yes if you're at that computer right now and you opened the sign-in page yourself. Someone who shows you a code could be trying to get into your account.
      </div>
      {#if step.kind === "ask"}
        <p class="text-xs text-muted-foreground" aria-live="polite">{secondsLeft > 0 ? `This code works for ${secondsLeft} more seconds.` : "This code has run out."}</p>
      {/if}
      <div class="flex-1"></div>
      <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground disabled:opacity-50"
        disabled={step.kind === "answering" || secondsLeft === 0} onclick={() => void answer(true)}>
        {#if step.kind === "answering"}<Spinner class="h-4 w-4" />{/if}
        Yes, sign it in
      </button>
      <button type="button" class="h-12 rounded-lg border border-border text-[15px] font-medium disabled:opacity-50"
        disabled={step.kind === "answering"} onclick={() => void answer(false)}>
        No, that's not me
      </button>
    </div>
  {:else if step.kind === "done"}
    <div class="flex flex-col gap-5 pt-4">
      <div class="flex h-14 w-14 items-center justify-center rounded-full {step.approved ? 'bg-success/15' : 'bg-muted'}">
        {#if step.approved}<Check class="h-7 w-7 text-success" />{:else}<XCircle class="h-7 w-7 text-muted-foreground" />{/if}
      </div>
      <div>
        <h1 class="mb-1.5 text-[22px] font-bold">{step.approved ? `${step.device} is signed in` : "Turned down"}</h1>
        <p class="text-sm text-muted-foreground">
          {step.approved
            ? "It has its own session. Sign it out below any time, or from Account on the web."
            : "Nothing was signed in. If you didn't ask for that code, someone may have your username: consider changing your password."}
        </p>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-5">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><Monitor class="h-7 w-7" /></div>
      <div>
        <h1 class="mb-1.5 text-[22px] font-bold">Sign in on a computer</h1>
        <p class="text-sm leading-relaxed text-muted-foreground">On the computer, open <strong class="font-medium text-foreground">{apiClient.isSelfHosted() ? "your server's dashboard" : "app.getlogit.app"}</strong> and scan the code on the sign-in page. No password needed.</p>
      </div>
      {#if native}
        <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground disabled:opacity-50"
          disabled={step.kind === "looking"} onclick={() => void scan()}>
          {#if step.kind === "looking"}<Spinner class="h-4 w-4" />{:else}<ScanLine class="h-4 w-4" />{/if}
          Scan the code
        </button>
      {:else}
        <form class="flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); void lookUp(typed); }}>
          <label for="pair-code" class="text-sm font-medium">The text in the QR code</label>
          <input id="pair-code" bind:value={typed} autocomplete="off" placeholder="logit-pair:…"
            class="h-11 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <button type="submit" class="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!typed.trim() || step.kind === "looking"}>Continue</button>
        </form>
      {/if}
    </div>
  {/if}

  {#if error}<p class="mt-4 text-sm text-destructive" role="alert">{error}</p>{/if}

  {#if sessions && sessions.length > 0 && (step.kind === "start" || step.kind === "done")}
    <section class="mt-8 flex flex-col" aria-labelledby="signed-in-title">
      <h2 id="signed-in-title" class="mb-1 text-sm font-semibold">Where you're signed in</h2>
      {#each sessions as s (s.id)}
        <div class="flex items-center justify-between gap-3 border-t border-border py-3 text-sm">
          <span class="min-w-0">
            <span class="block truncate">{s.label}</span>
            {#if s.current}<span class="text-xs text-muted-foreground">This phone</span>{/if}
          </span>
          {#if !s.current}
            <button type="button" class="min-h-11 shrink-0 text-xs font-medium text-muted-foreground underline" onclick={() => void signOutSession(s)}>Sign out</button>
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</div>
