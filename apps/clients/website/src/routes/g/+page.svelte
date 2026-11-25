<!-- A group's link: getlogit.app/g#logit-gr1:<code>[:<server>]. The code stays after the #, so it
     never reaches a web server; this page reads it in the browser, shows the group (name, photo,
     how many, who runs it, from its server) and opens LogIt, where joining happens. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { parseGroupInvite } from "@logit/core/domain/groupInvite";
  import { PLAY_URL } from "$lib/site";

  type Group = { name: string; kind: string; place: string | null; photoUrl: string | null; members: number; organiser: string | null };

  let invite = $state<ReturnType<typeof parseGroupInvite>>(null);
  let group = $state<Group | null>(null);
  let problem = $state<string | null>(null);
  let ready = $state(false);
  let android = $state(false);

  async function read() {
    invite = parseGroupInvite(decodeURIComponent(location.hash.slice(1)));
    group = null;
    problem = null;
    if (!invite) {
      problem = "This group link is incomplete. Ask whoever sent it to send it again.";
      return;
    }
    try {
      const res = await fetch(`${invite.server}/groups/join/${encodeURIComponent(invite.code)}`);
      if (res.status === 404) problem = "This group link doesn't work any more. Ask for a new one.";
      else if (!res.ok) problem = "Couldn't open the group. Try again in a moment.";
      else group = await res.json();
    } catch {
      problem = "Couldn't open the group. Try again in a moment.";
    }
  }

  onMount(() => {
    android = /android/i.test(navigator.userAgent);
    void read().then(() => (ready = true));
    const onHash = () => void read();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  const openUrl = $derived(
    invite
      ? `intent://g?c=${location.hash.slice(1)}#Intent;scheme=logit;S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
      : "",
  );
  const initials = $derived(group ? group.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") : "");
</script>

<svelte:head>
  <title>{group ? `Join ${group.name} · ` : ""}LogIt</title>
  <meta name="robots" content="noindex" />
  <meta name="description" content="You've been invited to a group on LogIt." />
</svelte:head>

<div class="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
  {#if !ready}
    <p class="text-muted-foreground">Loading…</p>
  {:else if problem || !group}
    <h1 class="text-2xl font-bold text-heading">This group can't be opened</h1>
    <p class="text-muted-foreground">{problem}</p>
  {:else}
    <div class="flex items-center gap-4">
      <span class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-2xl font-bold">
        {#if group.photoUrl}<img src={group.photoUrl.startsWith("/") ? `${invite?.server}${group.photoUrl}` : group.photoUrl} alt="" class="size-full object-cover" />{:else}{initials}{/if}
      </span>
      <div>
        <h1 class="text-2xl font-bold text-heading">Join {group.name}</h1>
        <p class="text-muted-foreground">{[group.kind, group.place, `${group.members} ${group.members === 1 ? "member" : "members"}`, group.organiser ? `run by ${group.organiser}` : null].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
    <p class="text-muted-foreground">
      Members see each other's names and photos, the events they're going to, and the group chat. Never your workouts or weights, unless you share them.
    </p>

    {#if android}
      <a href={openUrl} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Open in LogIt</a>
      <p class="text-sm text-muted-foreground">No LogIt yet? The button takes you to Google Play. Once it's installed, come back to this link and tap the button again.</p>
    {:else}
      <p class="text-muted-foreground">Open this link on your Android phone to join.</p>
      <a href={PLAY_URL} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Get LogIt</a>
    {/if}
  {/if}
</div>
