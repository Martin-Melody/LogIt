<!-- The top of a public profile (design canvas W1): photo, counts, name, bio, and Follow, which
     opens the profile in the app (or Sign in on the web). -->
<script lang="ts">
  import { DASHBOARD_URL } from "$lib/site";
  import { photoUrl } from "./publicApi";

  type Profile = { username: string; displayName: string; bio: string | null; avatarUrl: string | null; posts: number; followers: number; following: number };
  const { profile, api, small = false }: { profile: Profile; api: string; small?: boolean } = $props();
  const avatar = $derived(photoUrl(api, profile.avatarUrl));
</script>

<div class="flex items-center gap-6">
  <span class="flex {small ? 'size-12 text-lg' : 'size-20 text-3xl'} shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-heading">
    {#if avatar}<img src={avatar} alt="" class="size-full object-cover" />{:else}{(profile.displayName || profile.username).slice(0, 1).toUpperCase()}{/if}
  </span>
  {#if !small}
    <div class="flex flex-1 justify-around text-center">
      {#each [[profile.posts, "posts"], [profile.followers, "followers"], [profile.following, "following"]] as [n, label] (label)}
        <span class="flex flex-col"><strong class="text-lg text-heading">{n}</strong><span class="text-xs text-muted-foreground">{label}</span></span>
      {/each}
    </div>
  {:else}
    <span class="flex min-w-0 flex-1 flex-col"><strong class="truncate text-heading">{profile.displayName}</strong><span class="text-sm text-muted-foreground">@{profile.username}</span></span>
    <a href="{DASHBOARD_URL}/social/{profile.username}" class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Follow</a>
  {/if}
</div>
{#if !small}
  <div class="flex flex-col gap-1">
    <h1 class="text-lg font-bold text-heading">{profile.displayName} <span class="text-sm font-normal text-muted-foreground">@{profile.username}</span></h1>
    {#if profile.bio}<p class="whitespace-pre-wrap text-[15px] leading-relaxed">{profile.bio}</p>{/if}
  </div>
{/if}
