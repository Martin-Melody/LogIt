<!-- The Profile tab (design canvas PR1/PR3). Signed in, it's your profile exactly as others see
     it, plus Edit profile and Share profile. Without an account it's the same idea, kept on this
     phone, with an offer to make an account. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Cloud, Plus, Settings } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import ProfileView from "$lib/components/social/ProfileView.svelte";
  import ProfileCards from "$lib/components/social/ProfileCards.svelte";
  import { shownCards } from "@logit/core/domain/profileCards";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import { Button } from "$lib/components/ui/button";
  import { autoTour } from "$lib/tour/index";
  import { photoSrc } from "@logit/core/api/photosApi";
  import type { PublicProfileData } from "@logit/core/api/socialApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { buildPublicProfileData, syncOwnProfile } from "$lib/features/profileWidgets/publicProfileSync";

  let showCreatePost = $state(false);
  // Remounts the profile after a sync or a new post, so it shows the server's latest.
  let refreshKey = $state(0);
  let localData = $state<PublicProfileData | null>(null);
  const localCards = $derived(shownCards(localData));

  onMount(() => {
    void autoTour("app.profile");
    if (authStore.isAuthenticated) void syncOwnProfile().then(() => refreshKey++);
    else void buildPublicProfileData().then((d) => (localData = d)).catch(() => {});
  });
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <h1 class="page-title">{authStore.isAuthenticated && authStore.user ? `@${authStore.user.username}` : "Profile"}</h1>
    {#if authStore.isAuthenticated}
      <Button variant="ghost" size="icon" aria-label="New post" onclick={() => (showCreatePost = true)}>
        <Plus class="h-5 w-5" />
      </Button>
    {/if}
    <Button variant="ghost" size="icon" aria-label="Settings" onclick={() => void goto("/settings")} data-guide="profile-settings">
      <Settings class="h-5 w-5" />
    </Button>
  </PageHeader>

  {#if authStore.isAuthenticated && authStore.user}
    {#key refreshKey}
      <ProfileView username={authStore.user.username} avatarGuideMark="profile-avatar" trainingGuideMark="profile-training" />
    {/key}
  {:else}
    <div class="flex items-center gap-[18px] px-4 pt-3.5 pb-2.5" data-guide="profile-avatar">
      <span class="flex size-[84px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[28px] font-bold">
        {#if $profile.avatarDataUrl}<img src={photoSrc($profile.avatarDataUrl)} alt="" class="size-full object-cover" />{:else}{($profile.name || "?").charAt(0).toUpperCase()}{/if}
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <p class="truncate text-[17px] font-semibold">{$profile.name || "Your name"}</p>
        <p class="text-[13px] text-muted-foreground">On this phone only</p>
      </div>
    </div>
    {#if $profile.bio}<p class="whitespace-pre-wrap px-4 pb-3 text-sm">{$profile.bio}</p>{/if}
    <div class="px-4 pb-3">
      <button type="button" class="h-10 w-full rounded-lg bg-muted text-sm font-semibold" data-guide="profile-edit" onclick={() => goto("/profile/edit")}>Edit profile</button>
    </div>
    <div class="mx-4 mb-2 flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <div class="flex items-start gap-2.5">
        <Cloud class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div class="flex flex-col gap-0.5">
          <p class="text-[15px] font-semibold">Share this with friends</p>
          <p class="text-[13px] leading-normal text-muted-foreground">With a free account this page becomes your profile: people can follow you, see these cards and your posts, and it's backed up.</p>
        </div>
      </div>
      <Button class="h-11" onclick={() => void goto("/auth?mode=register")}>Create an account</Button>
    </div>
    <div data-guide="profile-training">
      {#if localData && localCards.length}
        <ProfileCards data={localData} name={$profile.name} />
      {:else}
        <p class="px-6 py-8 text-center text-sm text-muted-foreground">Your split, records and weight trend can show here. Pick them in Edit profile.</p>
      {/if}
    </div>
  {/if}
</div>

<CreatePostSheet
  open={showCreatePost}
  onposted={() => { showCreatePost = false; refreshKey++; }}
  onclose={() => (showCreatePost = false)}
/>
