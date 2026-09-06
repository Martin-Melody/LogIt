<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Settings, Pencil, Check, X, SlidersHorizontal, Dumbbell, Rss, Cloud, Server, PenSquare } from "lucide-svelte";
  import { startProfileTour } from "$lib/tour/index";
  import ProfileAvatar from "$lib/components/ProfileAvatar.svelte";
  import ProfileView from "$lib/components/social/ProfileView.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { profileConfig } from "$lib/stores/profileConfig.store";
  import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getServerMode } from "@logit/core/api/serverConfig";
  import { pushPublicProfileSnapshot } from "$lib/features/profileWidgets/publicProfileSync";

  // --- Profile editing (shared by both the authenticated-via-ProfileView header below and
  // the bespoke unauthenticated one — the underlying local profile.store edit is identical
  // either way, only the surrounding chrome differs). ---
  let editing = $state(false);
  const draft = $state({ name: "", bio: "" });
  let showCreatePost = $state(false);

  // Bumped after anything that changes what the *public* snapshot should show (a save, an
  // avatar change, a new post) — remounts <ProfileView> below, forcing a refetch. ProfileView
  // has no external "refresh" hook, so this is the same trick used for {#key username} on
  // social/[username]/+page.svelte.
  let refreshKey = $state(0);

  function openEdit() {
    draft.name = $profile.name;
    draft.bio = $profile.bio;
    editing = true;
  }

  function saveEdit() {
    profile.save({ name: draft.name.trim(), bio: draft.bio.trim() });
    editing = false;
    void syncPublicProfile().then(() => refreshKey++);
  }

  // Delegates to the shared function (publicProfileSync.ts) rather than building the PATCH
  // inline here — extracted out precisely so this page could be rewritten (this rewrite)
  // without having to move it.
  const syncPublicProfile = pushPublicProfileSnapshot;

  const serverMode = getServerMode();

  // --- Widgets ---
  const widgets = localProfileWidgetRegistry.list();

  const enabledWidgets = $derived(
    [...$profileConfig.slots]
      .filter((s) => s.enabled)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => ({ slot: s, def: widgets.find((w) => w.id === s.id) }))
      .filter((x): x is { slot: typeof x.slot; def: NonNullable<typeof x.def> } => x.def !== undefined),
  );

  let _lastAvatarUrl = $state<string | undefined>(undefined);

  $effect(() => {
    const current = $profile.avatarDataUrl;
    if (authStore.isAuthenticated && current && current !== _lastAvatarUrl) {
      _lastAvatarUrl = current;
      void syncPublicProfile().then(() => refreshKey++);
    }
  });

  onMount(() => {
    void startProfileTour();
    if (authStore.isAuthenticated) {
      _lastAvatarUrl = $profile.avatarDataUrl; // seed so the effect above doesn't double-fire
      void syncPublicProfile(); // picks up anything (incl. new widgets) enabled since last push
    }
  });
</script>

{#snippet editForm()}
  <div class="w-full max-w-xs flex flex-col gap-3 items-center">
    <ProfileAvatar name={$profile.name} avatarDataUrl={$profile.avatarDataUrl} editable class="h-20 w-20" />
    <div class="w-full flex flex-col gap-1">
      <label class="text-xs text-muted-foreground" for="p-name">Name</label>
      <input
        id="p-name"
        type="text"
        autocomplete="name"
        class="w-full rounded border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={draft.name}
      />
    </div>
    <div class="w-full flex flex-col gap-1">
      <label class="text-xs text-muted-foreground" for="p-bio">Bio</label>
      <textarea
        id="p-bio"
        rows={3}
        placeholder="Something about yourself…"
        class="w-full rounded border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={draft.bio}
      ></textarea>
    </div>
    <div class="flex gap-2 justify-center">
      <Button size="sm" onclick={saveEdit}><Check class="h-3.5 w-3.5 mr-1" /> Save</Button>
      <Button size="sm" variant="outline" onclick={() => (editing = false)}><X class="h-3.5 w-3.5 mr-1" /> Cancel</Button>
    </div>
  </div>
{/snippet}

<div class="flex flex-col pb-24">

  <!-- Settings gear -->
  <div class="flex justify-end px-3 pt-3">
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => void goto("/settings")} data-tour="profile-settings">
      <Settings class="h-4 w-4" />
    </Button>
  </div>

  {#if authStore.isAuthenticated && authStore.user}
    {#key refreshKey}
      <ProfileView username={authStore.user.username} avatarTourId="profile-avatar">
        {#snippet headerActions()}
          {#if editing}
            {@render editForm()}
          {:else}
            <div class="flex items-center gap-2">
              <Button variant="outline" size="sm" onclick={openEdit} data-tour="profile-edit">
                <Pencil class="h-3.5 w-3.5 mr-1.5" /> Edit profile
              </Button>
              <Button variant="outline" size="sm" onclick={() => (showCreatePost = true)}>
                <PenSquare class="h-3.5 w-3.5 mr-1.5" /> New post
              </Button>
            </div>
          {/if}
        {/snippet}
      </ProfileView>
    {/key}
  {:else}
    <!-- Fully local — no server round-trip, works offline. ProfileView can't render here
         (it's 100% server-backed), so this stays its own small implementation. -->
    <div class="flex flex-col items-center gap-3 px-4 pt-2 pb-6">
      <div data-tour="profile-avatar">
        <ProfileAvatar name={$profile.name} avatarDataUrl={$profile.avatarDataUrl} editable={!editing} class="h-24 w-24" />
      </div>

      {#if editing}
        {@render editForm()}
      {:else}
        <div class="text-center flex flex-col gap-1">
          <h1 class="text-xl font-bold">{$profile.name || "Your Name"}</h1>
          {#if $profile.bio}
            <p class="text-sm text-muted-foreground max-w-xs mt-0.5">{$profile.bio}</p>
          {:else}
            <p class="text-sm text-muted-foreground/50 italic mt-0.5">Add a bio…</p>
          {/if}
        </div>
        <Button variant="outline" size="sm" onclick={openEdit} data-tour="profile-edit">
          <Pencil class="h-3.5 w-3.5 mr-1.5" /> Edit profile
        </Button>
      {/if}
    </div>
  {/if}

  <!-- Account status bar -->
  <div class="mx-3 mb-1">
    {#if authStore.isAuthenticated && authStore.user}
      <div class="flex items-center gap-3 rounded border border-border px-3 py-2">
        {#if serverMode === "cloud"}
          <Cloud class="h-3.5 w-3.5 text-primary shrink-0" />
        {:else}
          <Server class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {/if}
        <p class="text-xs text-muted-foreground flex-1 min-w-0 truncate">
          {serverMode === "cloud" ? "Logit cloud" : "Self-hosted"}
        </p>
        <Button variant="ghost" size="sm" class="text-muted-foreground h-7 text-xs shrink-0"
          onclick={() => void authStore.logout()}>
          Sign out
        </Button>
      </div>
    {:else}
      <button
        type="button"
        class="w-full flex items-center justify-between rounded border border-dashed border-border px-3 py-2.5 text-left hover:border-muted-foreground/50 transition-colors"
        onclick={() => void goto("/auth?mode=register")}
      >
        <div>
          <p class="text-sm font-medium">Create an account</p>
          <p class="text-xs text-muted-foreground">Unlock social features and cloud backup.</p>
        </div>
        <Cloud class="h-4 w-4 text-muted-foreground/50 shrink-0 ml-3" />
      </button>
    {/if}
  </div>

  <!-- Local profile widgets (personalisation — plugin-facing, see
       feedback_design_for_plugins; distinct from the synced "Training stats" ProfileView
       renders above, which read a snapshot rather than local data live). -->
  <div class="flex flex-col gap-3 px-3" data-tour="profile-widgets">
    {#each enabledWidgets as { def } (def.id)}
      <svelte:component this={def.component} {...(def.props ?? {})} />
    {/each}
  </div>

  <!-- Bottom actions -->
  <div class="flex justify-center gap-1 mt-6 flex-wrap px-2">
    <Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" onclick={() => void goto("/exercises")}>
      <Dumbbell class="h-3.5 w-3.5" /> Exercise library
    </Button>
    <span class="text-muted-foreground/30 self-center">·</span>
    <Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" onclick={() => void goto("/profile/customize")}>
      <SlidersHorizontal class="h-3.5 w-3.5" /> Customise
    </Button>
    {#if authStore.isAuthenticated}
      <span class="text-muted-foreground/30 self-center">·</span>
      <Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" onclick={() => void goto("/social")}>
        <Rss class="h-3.5 w-3.5" /> Feed
      </Button>
    {/if}
  </div>

</div>

<CreatePostSheet
  open={showCreatePost}
  onposted={() => { showCreatePost = false; refreshKey++; }}
  onclose={() => (showCreatePost = false)}
/>
