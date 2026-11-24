<!-- A friend's invite: getlogit.app/f#logit-fr1:<code>[:<server>]. The code stays after the #, so it
     never reaches a web server; this page reads it in the browser, shows who sent it (name and
     photo only, from their server) and opens LogIt, where accepting makes them follow each other. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { parseInvite } from "@logit/core/domain/friendInvite";
  import { PLAY_URL } from "$lib/site";

  type Inviter = { username: string; displayName: string; avatarUrl: string | null };

  let invite = $state<ReturnType<typeof parseInvite>>(null);
  let inviter = $state<Inviter | null>(null);
  let problem = $state<string | null>(null);
  let ready = $state(false);
  let android = $state(false);

  async function read() {
    invite = parseInvite(decodeURIComponent(location.hash.slice(1)));
    inviter = null;
    problem = null;
    if (!invite) {
      problem = "This invite link is incomplete. Ask whoever sent it to send it again.";
      return;
    }
    try {
      const res = await fetch(`${invite.server}/friends/invites/${encodeURIComponent(invite.code)}`);
      if (res.status === 404) problem = "This invite link doesn't work any more. Ask for a new one.";
      else if (!res.ok) problem = "Couldn't open the invite. Try again in a moment.";
      else inviter = await res.json();
    } catch {
      problem = "Couldn't open the invite. Try again in a moment.";
    }
  }

  onMount(() => {
    android = /android/i.test(navigator.userAgent);
    void read().then(() => (ready = true));
    const onHash = () => void read();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  // Opens the invite in LogIt; Chrome goes to Google Play when LogIt isn't installed.
  const openUrl = $derived(
    invite
      ? `intent://f?c=${location.hash.slice(1)}#Intent;scheme=logit;S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
      : "",
  );
</script>

<svelte:head>
  <title>{inviter ? `${inviter.displayName} invited you · ` : ""}LogIt</title>
  <meta name="robots" content="noindex" />
  <meta name="description" content="A friend invited you to train with them on LogIt." />
</svelte:head>

<div class="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
  {#if !ready}
    <p class="text-muted-foreground">Loading…</p>
  {:else if problem || !inviter}
    <h1 class="text-2xl font-bold text-heading">This invite can't be opened</h1>
    <p class="text-muted-foreground">{problem}</p>
  {:else}
    <div class="flex items-center gap-4">
      <span class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-2xl font-semibold">
        {#if inviter.avatarUrl}<img src={inviter.avatarUrl.startsWith("/") ? `${invite?.server}${inviter.avatarUrl}` : inviter.avatarUrl} alt="" class="size-full object-cover" />{:else}{inviter.displayName.charAt(0).toUpperCase()}{/if}
      </span>
      <div>
        <h1 class="text-2xl font-bold text-heading">{inviter.displayName} invited you</h1>
        <p class="text-muted-foreground">@{inviter.username} on LogIt</p>
      </div>
    </div>
    <p class="text-muted-foreground">
      Accept in the app and you'll follow each other: see when the other is training and cheer each other on. You set up your own training.
    </p>

    {#if android}
      <a href={openUrl} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Open in LogIt</a>
      <p class="text-sm text-muted-foreground">No LogIt yet? The button takes you to Google Play. Once it's installed, come back to this link and tap the button again.</p>
    {:else}
      <p class="text-muted-foreground">Open this link on your Android phone to accept.</p>
      <a href={PLAY_URL} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Get LogIt</a>
    {/if}
  {/if}
</div>
