<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Settings, Pencil, Check, X, SlidersHorizontal, Dumbbell, Cloud, Server, Rss } from "lucide-svelte";
  import { startProfileTour } from "$lib/tour/index";
  import ProfileAvatar from "$lib/components/ProfileAvatar.svelte";
  import ConnectAccountPrompt from "$lib/components/ConnectAccountPrompt.svelte";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { profileConfig } from "$lib/stores/profileConfig.store";
  import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getServerMode } from "$lib/api/serverConfig";

  // --- Profile editing ---
  let editing = $state(false);
  const draft = $state({ name: "", bio: "" });

  function openEdit() {
    draft.name = $profile.name;
    draft.bio = $profile.bio;
    editing = true;
  }

  function saveEdit() {
    profile.save({ name: draft.name.trim(), bio: draft.bio.trim() });
    editing = false;
  }

  onMount(() => startProfileTour());

  let showConnectPrompt = $state(false);
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
</script>

<div class="flex flex-col pb-24">

  <!-- Settings gear -->
  <div class="flex justify-end px-3 pt-3">
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => void goto("/settings")} data-tour="profile-settings">
      <Settings class="h-4 w-4" />
    </Button>
  </div>

  <!-- Profile header -->
  <div class="flex flex-col items-center gap-3 px-4 pt-2 pb-6">
    <!-- Avatar -->
    <div data-tour="profile-avatar">
      <ProfileAvatar
        name={$profile.name}
        avatarDataUrl={$profile.avatarDataUrl}
        editable={!editing}
        class="h-24 w-24"
      />
    </div>

    <!-- Name + bio / edit form -->
    {#if editing}
      <div class="w-full max-w-xs flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="p-name">Name</label>
          <input
            id="p-name"
            type="text"
            autocomplete="name"
            class="w-full rounded border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={draft.name}
          />
        </div>
        <div class="flex flex-col gap-1">
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
    {:else}
      <div class="text-center flex flex-col gap-1">
        <h1 class="text-xl font-bold">{$profile.name || "Your Name"}</h1>
        {#if $profile.bio}
          <p class="text-sm text-muted-foreground max-w-xs">{$profile.bio}</p>
        {:else}
          <p class="text-sm text-muted-foreground/50 italic">Add a bio…</p>
        {/if}
      </div>
      <Button variant="outline" size="sm" onclick={openEdit} data-tour="profile-edit">
        <Pencil class="h-3.5 w-3.5 mr-1.5" /> Edit profile
      </Button>
    {/if}
  </div>

  <!-- Account status -->
  <div class="mx-3 mb-1">
    {#if authStore.isAuthenticated && authStore.user}
      <div class="flex items-center gap-3 rounded border border-border px-3 py-2.5">
        {#if serverMode === "cloud"}
          <Cloud class="h-4 w-4 text-primary shrink-0" />
        {:else}
          <Server class="h-4 w-4 text-muted-foreground shrink-0" />
        {/if}
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">@{authStore.user.username}</p>
          <p class="text-xs text-muted-foreground">{serverMode === "cloud" ? "Logit cloud" : "Self-hosted"}</p>
        </div>
        <Button variant="ghost" size="sm" class="text-muted-foreground shrink-0"
          onclick={() => void authStore.logout()}>
          Sign out
        </Button>
      </div>
    {:else}
      <button
        type="button"
        class="w-full flex items-center justify-between rounded border border-dashed border-border px-3 py-2.5 text-left hover:border-muted-foreground/50 transition-colors"
        onclick={() => (showConnectPrompt = true)}
      >
        <div>
          <p class="text-sm font-medium">Connect an account</p>
          <p class="text-xs text-muted-foreground">Unlock social features and cloud backup.</p>
        </div>
        <Cloud class="h-4 w-4 text-muted-foreground/50 shrink-0 ml-3" />
      </button>
    {/if}
  </div>

  <!-- Profile widgets -->
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

<ConnectAccountPrompt
  open={showConnectPrompt}
  feature="Social features and cloud backup"
  onclose={() => (showConnectPrompt = false)}
/>
