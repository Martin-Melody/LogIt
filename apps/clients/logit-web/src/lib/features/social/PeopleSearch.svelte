<script lang="ts">
  import { socialApi, type UserSearchResult } from "@logit/core/api/socialApi";
  import Avatar from "./Avatar.svelte";

  let q = $state("");
  let results = $state<UserSearchResult[]>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = 0;

  function search() {
    clearTimeout(timer);
    const query = q.trim();
    if (query.length < 2) { results = []; return; }
    timer = setTimeout(async () => {
      const mine = ++latest;
      try {
        const r = await socialApi.searchUsers(query);
        if (mine === latest) results = r;
      } catch {
        if (mine === latest) results = [];
      }
    }, 250);
  }
</script>

<section class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
  <label for="find-people" class="text-sm font-semibold">Find people</label>
  <input id="find-people" type="search" bind:value={q} oninput={search} placeholder="Name or @username" autocomplete="off"
    class="h-9 w-full rounded-[9px] border border-border bg-background px-3 text-[13px]" />
  {#if q.trim().length >= 2}
    <div class="flex flex-col gap-1">
      {#each results as u (u.id)}
        <a href="/social/{u.username}" class="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/60">
          <Avatar name={u.displayName} url={u.avatarUrl} size={30} />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium">{u.displayName}</span>
            <span class="block truncate text-xs text-muted-foreground">@{u.username} · {u.followerCount} follower{u.followerCount === 1 ? "" : "s"}{u.isFollowing ? " · following" : ""}</span>
          </span>
        </a>
      {:else}
        <p class="px-1.5 text-xs text-muted-foreground">Nobody by that name.</p>
      {/each}
    </div>
  {/if}
</section>
