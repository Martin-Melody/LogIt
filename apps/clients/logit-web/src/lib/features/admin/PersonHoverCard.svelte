<script lang="ts">
  import type { Snippet } from "svelte";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { Spinner } from "$lib/components/ui/spinner";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { shortDate, when } from "$lib/features/coaching/format";
  import { adminApi, at, type PersonRow } from "./adminApi";

  // Admin: hover (or focus) an @name to see the account before deciding anything.
  // Loads the first time it opens; the name itself still links to their page.
  let { username, id = null, class: className = "", children }: { username: string; id?: string | null; class?: string; children: Snippet } = $props();

  let open = $state(false);
  let person = $state<PersonRow | null | undefined>(undefined);
  $effect(() => {
    if (!open || person !== undefined) return;
    adminApi.people(username)
      .then((r) => (person = r.users.find((u) => u.username === username) ?? null))
      .catch(() => (person = null));
  });
  const href = $derived((person?.id ?? id) ? `/admin/people?id=${person?.id ?? id}` : "/admin/people");
</script>

<HoverCard.Root bind:open openDelay={400} closeDelay={100}>
  <HoverCard.Trigger {href} class={className}>{@render children()}</HoverCard.Trigger><!-- no space: the name sits inside a sentence
  --><HoverCard.Content class="w-72 p-3.5" align="start">
    {#if person === undefined}
      <div class="grid h-24 place-items-center"><Spinner class="size-5 text-muted-foreground" /></div>
    {:else if person === null}
      <p class="text-[13px] text-muted-foreground">No account called @{username} any more.</p>
    {:else}
      {@const p = person}
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2.5">
          <Avatar name={p.displayName || p.username} size={40} />
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 text-[15px] font-semibold"><span class="truncate">{p.displayName || p.username}</span>{#if p.isAdmin}<span class="rounded-full bg-primary/15 px-2 py-px text-[11px] font-semibold">Admin</span>{/if}</div>
            <div class="truncate text-xs text-muted-foreground">@{p.username}</div>
          </div>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
          <dt class="text-muted-foreground">Joined</dt><dd>{shortDate(at(p.createdAt))}</dd>
          <dt class="text-muted-foreground">Last seen</dt><dd>{p.lastActive ? when(at(p.lastActive)) : "Not yet"}</dd>
          <dt class="text-muted-foreground">Posts</dt><dd class="tabular-nums">{p.postCount}</dd>
        </dl>
        <a href="/admin/people?id={p.id}" class="inline-flex h-[34px] items-center justify-center rounded-[9px] border border-border text-[13px] font-medium hover:bg-muted">Open their page</a>
      </div>
    {/if}
  </HoverCard.Content>
</HoverCard.Root>
