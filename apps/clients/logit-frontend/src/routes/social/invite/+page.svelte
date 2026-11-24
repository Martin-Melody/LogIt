<!-- Opening a friend's invite (from the link, the QR or the website's "Open in LogIt"): who sent
     it, then "Follow each other". Journey F2 in docs/testing-friends.md. -->
<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError, apiBaseUrl } from "@logit/core/api/client";
  import { friendsApi, parseInvite, type InvitePreview } from "@logit/core/api/friendsApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { back } from "$lib/navigation";
  import { holdInvite } from "$lib/features/friends/invite.svelte";

  const invite = $derived(parseInvite(page.url.searchParams.get("c") ?? ""));
  const sameServer = $derived(!!invite && invite.server === apiBaseUrl().replace(/\/+$/, ""));
  let preview = $state<InvitePreview | null>(null);
  let error = $state<string | null>(null);
  let accepting = $state(false);

  onMount(async () => {
    if (!invite) {
      error = "This invite link is incomplete. Ask your friend to send it again.";
      return;
    }
    try {
      preview = await friendsApi.preview(invite);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't open the invite.";
    }
  });

  async function accept() {
    if (!invite) return;
    accepting = true;
    try {
      const { username } = await friendsApi.accept(invite.code);
      toast.success(`You and ${preview?.displayName ?? username} follow each other`);
      await goto(`/social/${username}`, { replaceState: true });
    } catch (e) {
      accepting = false;
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't do that. Try again.");
    }
  }

  // Signed out: the invite is kept through sign-up and onboarding, then this page reopens.
  function signIn() {
    holdInvite(page.url.searchParams.get("c") ?? "");
    void goto("/onboarding");
  }
</script>

<div class="flex min-h-full flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/social")} />
    <h1 class="page-title">Invite</h1>
  </PageHeader>

  <div class="flex flex-1 flex-col items-center gap-4 px-6 pt-10 text-center">
    {#if error}
      <p class="text-sm text-muted-foreground">{error}</p>
    {:else if !preview}
      <Loader2 class="size-5 animate-spin text-muted-foreground" />
    {:else}
      <span class="flex size-20 items-center justify-center overflow-hidden rounded-full bg-muted text-2xl font-semibold">
        {#if preview.avatarUrl}<img src={photoSrc(preview.avatarUrl)} alt="" class="size-full object-cover" />{:else}{preview.displayName.charAt(0).toUpperCase()}{/if}
      </span>
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-bold tracking-tight">{preview.displayName} invited you</h2>
        <p class="text-sm text-muted-foreground">@{preview.username}</p>
      </div>
      <p class="max-w-[32ch] text-sm leading-relaxed text-muted-foreground">You'll follow each other, see when the other is training and can cheer each other on.</p>

      <div class="mt-2 flex w-full max-w-sm flex-col gap-2">
        {#if !authStore.isAuthenticated}
          <button type="button" class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground" onclick={signIn}>Sign in or make an account</button>
        {:else if !sameServer}
          <p class="text-sm leading-relaxed text-muted-foreground">{preview.displayName} is on another LogIt server, so you can't follow each other yet. That comes when LogIt servers connect.</p>
        {:else}
          <button type="button" class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60" disabled={accepting} onclick={accept}>Follow each other</button>
        {/if}
        <button type="button" class="h-11 rounded-lg text-sm font-medium text-muted-foreground" onclick={() => back("/social")}>Not now</button>
      </div>
    {/if}
  </div>
</div>
