<script lang="ts">
  import { back } from "$lib/navigation";
  // Move to another server (design canvas 9 and 10). The training comes along: it's uploaded to
  // the new server and the phone only switches once that has landed (lib/accounts/moveServer.ts).
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft, ArrowRight, Check, CheckCircle, Loader2, XCircle } from "lucide-svelte";
  import { apiClient } from "@logit/core/api/client";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { billing } from "$lib/billing/billing.svelte";
  import {
    checkServer, currentServerName, deleteOldAccount, moveToServer, serverName, HOSTED_SERVER,
    type MoveCounts, type MovedFrom, type ServerCheck,
  } from "$lib/accounts/moveServer";

  const from = currentServerName();
  const onHosted = from === HOSTED_SERVER;

  // Where to: someone on getlogit.app can only go to their own server; someone on their own
  // server can come to getlogit.app or go to a different one.
  let destination = $state<"hosted" | "own">("own");
  let address = $state("");
  let check = $state<ServerCheck | "checking" | null>(null);
  let accountMode = $state<"new" | "existing">("new");
  let username = $state(apiClient.getUser()?.username ?? "");
  let email = $state("");
  let password = $state("");
  let inviteCode = $state("");
  let moving = $state(false);
  let error = $state<string | null>(null);
  let done = $state<{ to: string; from: MovedFrom; counts: MoveCounts; toOwnServer: boolean } | null>(null);

  let deleting = $state(false);
  let showDelete = $state(false);
  let oldPassword = $state("");
  let deleteError = $state<string | null>(null);
  let oldDeleted = $state(false);

  onMount(async () => {
    if (!isNativePlatform() || !apiClient.getUser()) await goto("/settings", { replaceState: true });
    if (!onHosted) {
      destination = "hosted";
      void runCheck();
    }
  });

  const targetUrl = $derived(destination === "hosted" ? null : address.trim() || null);
  const toName = $derived(destination === "hosted" ? HOSTED_SERVER : address.trim() ? serverName(address) : "Your server");
  const inviteOnly = $derived(typeof check === "object" && check !== null && check.reachable && check.inviteOnly);
  const reachable = $derived(typeof check === "object" && check !== null && check.reachable);
  const canMove = $derived(
    !moving && reachable && username.trim() !== "" && password.length >= 8
      && (accountMode === "existing" || (email.includes("@") && (!inviteOnly || inviteCode.trim() !== ""))),
  );

  let timer: ReturnType<typeof setTimeout> | null = null;
  function addressTyped() {
    check = null;
    if (timer) clearTimeout(timer);
    if (address.trim().length < 4) return;
    timer = setTimeout(() => void runCheck(), 600);
  }

  async function runCheck() {
    const url = targetUrl;
    if (destination === "own" && !url) return;
    check = "checking";
    const result = await checkServer(url);
    if (url === targetUrl) check = result;
  }

  function pick(next: "hosted" | "own") {
    if (next === "hosted" && onHosted) return;
    destination = next;
    check = null;
    void runCheck();
  }

  async function move() {
    if (!canMove) return;
    moving = true;
    error = null;
    const result = await moveToServer({
      url: targetUrl, account: accountMode, username, password,
      email: accountMode === "new" ? email : undefined,
      inviteCode: accountMode === "new" && inviteOnly ? inviteCode : undefined,
    });
    moving = false;
    if (result.ok) done = { to: result.to, from: result.from, counts: result.counts, toOwnServer: targetUrl !== null };
    else error = result.error;
  }

  async function removeOld() {
    if (!done || !oldPassword) return;
    deleting = true;
    deleteError = null;
    const result = await deleteOldAccount(done.from, oldPassword);
    deleting = false;
    if (result.ok) {
      oldDeleted = true;
      showDelete = false;
    } else deleteError = result.error;
  }

  const planStillRunning = $derived(
    !!done && done.toOwnServer && !done.from.selfHosted && (done.from.tier === "Pro" || done.from.tier === "Studio") && !oldDeleted,
  );
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
  {#if done}
    <div class="flex flex-col gap-5 pt-8 flex-1">
      <div class="h-14 w-14 rounded-full bg-success/15 flex items-center justify-center">
        <Check class="h-7 w-7 text-success" />
      </div>
      <div>
        <h1 class="text-[22px] font-bold mb-1.5">You're on {done.to}</h1>
        <p class="text-sm text-muted-foreground">This phone now syncs with {done.toOwnServer ? "your own server" : done.to}.</p>
      </div>
      <ul class="flex flex-col rounded-[10px] border border-border text-sm">
        <li class="flex justify-between px-3.5 py-3 border-b border-border"><span>Workouts</span><span class="font-medium text-success">{done.counts.workouts} ✓</span></li>
        <li class="flex justify-between px-3.5 py-3 border-b border-border"><span>Splits and exercises</span><span class="font-medium text-success">{plural(done.counts.splits, "split")} ✓</span></li>
        <li class="flex justify-between px-3.5 py-3 border-b border-border"><span>Nutrition and habits</span><span class="font-medium text-success">✓</span></li>
        <li class="flex justify-between px-3.5 py-3"><span>Settings and layout</span><span class="font-medium text-success">✓</span></li>
      </ul>
      {#if planStillRunning}
        <div class="flex flex-col gap-2 rounded-[10px] bg-warning/10 p-3.5 text-sm">
          <p class="font-semibold">Your {done.from.tier} plan is still running</p>
          <p class="text-muted-foreground">You don't need it on your own server. Cancel it in Google Play so you're not charged again.</p>
          <button type="button" class="self-start min-h-11 font-medium underline" onclick={() => void billing.openSubscriptions()}>Open Google Play subscriptions</button>
        </div>
      {/if}
      <div class="flex-1"></div>
      <button type="button" class="h-12 rounded-lg bg-primary text-primary-foreground text-[15px] font-medium" onclick={() => goto("/settings")}>Done</button>
      {#if oldDeleted}
        <p class="text-center text-sm text-muted-foreground">Your {done.from.server} account is deleted.</p>
      {:else if !showDelete}
        <button type="button" class="min-h-11 text-sm text-destructive" onclick={() => (showDelete = true)}>Delete my {done.from.server} account</button>
      {:else}
        <div class="flex flex-col gap-2 rounded-[10px] border border-destructive/40 p-3.5">
          <p class="text-sm">Deletes @{done.from.username} and everything on {done.from.server}, posts and followers included. Your training stays here and on {done.to}.</p>
          <label for="old-password" class="text-sm font-medium">{done.from.server} password</label>
          <input id="old-password" type="password" autocomplete="current-password" bind:value={oldPassword}
            class="h-11 rounded-lg border border-border bg-background px-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
          {#if deleteError}<p class="text-sm text-destructive">{deleteError}</p>{/if}
          <div class="flex gap-2">
            <button type="button" class="flex-1 h-11 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
              disabled={!oldPassword || deleting} onclick={() => void removeOld()}>
              {#if deleting}<Loader2 class="inline h-4 w-4 animate-spin" />{:else}Delete it{/if}
            </button>
            <button type="button" class="flex-1 h-11 rounded-lg border border-border text-sm" onclick={() => (showDelete = false)}>Keep it</button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground self-start min-h-11" onclick={() => back("/settings")}>
      <ArrowLeft class="h-4 w-4" /> Settings
    </button>
    <h1 class="mt-3 mb-1.5 text-[22px] font-bold">Move to another server</h1>
    <p class="mb-4 text-sm text-muted-foreground">Your training comes with you: workouts, splits, nutrition, habits and settings.</p>

    <div class="mb-5 flex items-center gap-2.5">
      <div class="flex-1 min-w-0 rounded-lg bg-muted px-3 py-2.5">
        <p class="text-xs text-muted-foreground">From</p>
        <p class="truncate text-sm font-medium">{from}</p>
      </div>
      <ArrowRight class="h-5 w-5 shrink-0 text-muted-foreground" />
      <div class="flex-1 min-w-0 rounded-lg border-2 border-primary px-3 py-2.5">
        <p class="text-xs text-muted-foreground">To</p>
        <p class="truncate text-sm font-medium">{toName}</p>
        {#if inviteOnly}<p class="mt-1 text-xs font-medium text-warning">Invite only</p>{/if}
      </div>
    </div>

    <div class="flex flex-col gap-3.5">
      {#if !onHosted}
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="Where to">
          <button type="button" role="radio" aria-checked={destination === "hosted"}
            class="flex min-h-11 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left {destination === 'hosted' ? 'border-2 border-primary' : 'border-border'}"
            onclick={() => pick("hosted")}>
            <span class="text-[15px] font-medium">getlogit.app</span>
          </button>
          <button type="button" role="radio" aria-checked={destination === "own"}
            class="flex min-h-11 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left {destination === 'own' ? 'border-2 border-primary' : 'border-border'}"
            onclick={() => pick("own")}>
            <span class="text-[15px] font-medium">Another server of my own</span>
          </button>
        </div>
      {/if}

      {#if destination === "own"}
        <div class="flex flex-col gap-1.5">
          <label for="move-url" class="text-sm font-medium">Server address</label>
          <input id="move-url" type="url" inputmode="url" placeholder="https://logit.yourdomain.com" bind:value={address} oninput={addressTyped}
            class="h-11 rounded-lg border border-border bg-background px-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      {/if}
      {#if check === "checking"}
        <p class="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Checking…</p>
      {:else if reachable}
        <p class="flex items-center gap-1.5 text-xs text-success"><CheckCircle class="h-3.5 w-3.5" /> Found a Logit server</p>
      {:else if check}
        <p class="flex items-center gap-1.5 text-xs text-destructive"><XCircle class="h-3.5 w-3.5" /> Can't reach a Logit server there</p>
      {/if}

      <div class="flex gap-1 rounded-lg border border-border p-1">
        <button type="button" aria-pressed={accountMode === "new"}
          class="flex-1 h-10 rounded-md text-sm font-medium {accountMode === 'new' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}"
          onclick={() => (accountMode = "new")}>New account there</button>
        <button type="button" aria-pressed={accountMode === "existing"}
          class="flex-1 h-10 rounded-md text-sm font-medium {accountMode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}"
          onclick={() => (accountMode = "existing")}>I have one</button>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="move-username" class="text-sm font-medium">{accountMode === "new" ? "Username" : "Username or email"}</label>
        <input id="move-username" type="text" autocapitalize="none" autocomplete="username" bind:value={username}
          class="h-11 rounded-lg border border-border bg-background px-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      {#if accountMode === "new"}
        <div class="flex flex-col gap-1.5">
          <label for="move-email" class="text-sm font-medium">Email</label>
          <input id="move-email" type="email" autocomplete="email" bind:value={email}
            class="h-11 rounded-lg border border-border bg-background px-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      {/if}
      <div class="flex flex-col gap-1.5">
        <label for="move-password" class="text-sm font-medium">Password</label>
        <input id="move-password" type="password" autocomplete={accountMode === "new" ? "new-password" : "current-password"} bind:value={password}
          class="h-11 rounded-lg border border-border bg-background px-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
        {#if accountMode === "new" && password.length > 0 && password.length < 8}
          <span class="text-xs text-muted-foreground">At least 8 characters</span>
        {/if}
      </div>
      {#if accountMode === "new" && inviteOnly}
        <div class="flex flex-col gap-1.5">
          <label for="move-invite" class="text-sm font-medium">Invite code</label>
          <input id="move-invite" type="text" autocapitalize="characters" bind:value={inviteCode}
            class="h-11 rounded-lg border border-border bg-background px-3 text-[15px] font-medium tracking-wider focus:outline-none focus:ring-1 focus:ring-ring" />
          <span class="text-xs text-muted-foreground">From whoever runs this server</span>
        </div>
      {/if}
    </div>

    <div class="flex-1 min-h-6"></div>
    {#if error}<p class="mb-3 text-sm text-destructive" role="alert">{error}</p>{/if}
    <button type="button" class="h-12 rounded-lg bg-primary text-primary-foreground text-[15px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      disabled={!canMove} onclick={() => void move()}>
      {#if moving}<Loader2 class="h-4 w-4 animate-spin" /> Copying your training…{:else if error}Try again{:else}Move my training{/if}
    </button>
    <p class="mt-2.5 text-xs text-muted-foreground">Nothing changes until everything has been copied. Social posts and followers stay on {from}.</p>
  {/if}
</div>
