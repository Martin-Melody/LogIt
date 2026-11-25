<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    followedByText,
    notificationsApi,
    socialApi,
    type ApiNotification,
    type FollowRequestItem,
    type FollowStatus,
  } from "@logit/core/api/socialApi";
  import Avatar from "./Avatar.svelte";
  import FollowButton from "./FollowButton.svelte";
  import { socialBadge, timeAgo } from "./socialData.svelte";

  // The social part of the phone's inbox. Reading it here clears the badge on the phone too.
  let items = $state<ApiNotification[] | null>(null);
  let next = $state<string | null>(null);
  let requests = $state<FollowRequestItem[]>([]);
  let filter = $state<"all" | "mentions" | "follows">("all");
  let error = $state(false);
  const followBack = $state<Record<string, FollowStatus>>({});

  async function load(more = false) {
    try {
      const page = await notificationsApi.list(more ? next ?? undefined : undefined);
      items = more ? [...(items ?? []), ...page.notifications] : page.notifications;
      next = page.nextCursor;
      error = false;
    } catch {
      error = true;
      items ??= [];
    }
  }

  $effect(() => {
    void load();
    void socialApi.getFollowRequests().then((r) => (requests = r)).catch(() => {});
  });

  const shown = $derived(
    (items ?? []).filter((n) =>
      filter === "all" ? n.type !== "FollowRequest"
      : filter === "mentions" ? n.type === "Mention" || n.type === "Comment" || n.type === "Reply" || n.type === "Quote"
      : n.type === "Follow" || n.type === "FollowAccepted"),
  );
  const unread = $derived(shown.filter((n) => !n.readAt));
  const earlier = $derived(shown.filter((n) => n.readAt));

  async function markAll() {
    try {
      await notificationsApi.markRead();
      const now = new Date().toISOString();
      items = (items ?? []).map((n) => ({ ...n, readAt: n.readAt ?? now }));
      socialBadge.set(0);
    } catch {
      toast.error("Couldn't mark them read");
    }
  }

  async function open(n: ApiNotification) {
    if (n.readAt) return;
    items = (items ?? []).map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
    socialBadge.set(Math.max(0, socialBadge.count - 1));
    void notificationsApi.markRead([n.id]).catch(() => {});
  }

  async function answer(r: FollowRequestItem, accept: boolean) {
    requests = requests.filter((x) => x.user.id !== r.user.id);
    try {
      if (accept) await socialApi.acceptFollowRequest(r.user.username);
      else await socialApi.declineFollowRequest(r.user.username);
    } catch {
      requests = [r, ...requests];
      toast.error("Couldn't do that");
    }
  }

  function text(n: ApiNotification): string {
    const snippet = n.postBody ? `: "${n.postBody.length > 80 ? n.postBody.slice(0, 80) + "…" : n.postBody}"` : "";
    switch (n.type) {
      case "Like": return n.commentId ? "liked your comment" : `liked your post${snippet}`;
      case "Comment": return `commented on your post${snippet}`;
      case "Reply": return `replied to your comment${n.postBody ? ` on "${n.postBody.slice(0, 60)}${n.postBody.length > 60 ? "…" : ""}"` : ""}`;
      case "Mention": return n.commentId ? `mentioned you in a comment${n.postBody ? ` on "${n.postBody.slice(0, 60)}${n.postBody.length > 60 ? "…" : ""}"` : ""}` : `mentioned you${snippet}`;
      case "Repost": return `reposted your post${snippet}`;
      case "Quote": return `quoted your post${snippet}`;
      case "Follow": return "started following you";
      case "FollowRequest": return "asked to follow you";
      case "FollowAccepted": return "accepted your follow request";
      case "CoachInvite": return "wants to coach you";
      case "CoachProgram": return "sent you a program";
      case "CoachPaymentFailed": return "couldn't take your coaching payment. Check your card in My coach";
      case "Cheer": return "cheered you on";
      case "StoryCheer": return "cheered your story";
      case "GroupNote": return n.group ? `pinned a note in ${n.group.name}` : "pinned a note in a group";
      case "GroupRequest": return n.group ? `asked to join ${n.group.name}` : "asked to join your group";
      case "GroupApproved": return n.group ? `let you into ${n.group.name}` : "let you into the group";
      case "GroupEvent": return `added ${n.event?.title ?? "an event"}${n.group ? ` in ${n.group.name}` : ""}`;
      case "GroupEventChanged": return `changed the time or place of ${n.event?.title ?? "an event"}`;
      case "GroupEventCancelled": return `cancelled ${n.event?.title ?? "an event"}`;
      case "GroupReport": return "· a message was reported. Open the group's Reports in the app";
      case "GroupEventReminder": return `· ${n.event?.title ?? "Your event"} is tomorrow`;
      default: return "";
    }
  }
  const href = (n: ApiNotification) => (n.type === "CoachInvite" || n.type === "CoachProgram" || n.type === "CoachPaymentFailed" ? "/my-coach" : n.postId ? `/social/post/${n.postId}` : `/social/${n.actor.username}`);
</script>

{#snippet row(n: ApiNotification)}
  <div class="flex items-start gap-3 rounded-[9px] px-3.5 py-3 {n.readAt ? '' : 'bg-muted/50'}">
    {#if n.readAt}<span class="w-2 shrink-0"></span>{:else}<span class="mt-3.5 size-2 shrink-0 rounded-full bg-sky-500" aria-label="Unread"></span>{/if}
    <a href="/social/{n.actor.username}" onclick={() => open(n)}><Avatar name={n.actor.displayName} url={n.actor.avatarUrl} /></a>
    <a href={href(n)} onclick={() => open(n)} class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-[13px] leading-snug"><strong>{n.type === "GroupEventReminder" || n.type === "GroupReport" ? (n.group?.name ?? "Your group") : n.actor.displayName}</strong> {text(n)}</span>
      <span class="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
    </a>
    {#if n.type === "Follow"}
      <FollowButton username={n.actor.username} bind:status={() => followBack[n.actor.id] ?? n.actor.followStatus, (v) => (followBack[n.actor.id] = v!)}
        isPrivate={!!n.actor.isPrivate} followsYou />
    {/if}
  </div>
{/snippet}

<div class="flex flex-col gap-3.5">
  {#if requests.length}
    <section class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="text-sm font-semibold">Follow requests · {requests.length}</h2>
      {#each requests as r (r.user.id)}
        <div class="flex items-center gap-3">
          <a href="/social/{r.user.username}"><Avatar name={r.user.displayName} url={r.user.avatarUrl} /></a>
          <a href="/social/{r.user.username}" class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-semibold">{r.user.displayName}</span>
            <span class="block truncate text-xs text-muted-foreground">@{r.user.username} · {followedByText(r.followedBy, r.followedByOthers) ?? "no mutual follows"}</span>
          </a>
          <button type="button" onclick={() => answer(r, true)} class="h-8 rounded-[9px] bg-primary px-3 text-xs font-semibold text-primary-foreground">Accept</button>
          <button type="button" onclick={() => answer(r, false)} class="h-8 rounded-[9px] border border-border px-3 text-xs">Decline</button>
        </div>
      {/each}
    </section>
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-2.5">
    <div role="radiogroup" aria-label="Show" class="flex gap-1.5">
      {#each [["all", "All"], ["mentions", "Mentions"], ["follows", "Follows"]] as [f, label] (f)}
        <button type="button" role="radio" aria-checked={filter === f} onclick={() => (filter = f as typeof filter)}
          class="h-8 rounded-[9px] border border-border px-3 text-xs {filter === f ? 'bg-muted font-semibold' : 'text-muted-foreground'}">{label}</button>
      {/each}
    </div>
    <button type="button" onclick={markAll} disabled={!(items ?? []).some((n) => !n.readAt)} class="h-8 rounded-[9px] border border-border px-3 text-xs disabled:opacity-50">Mark all as read</button>
  </div>

  {#if items === null}
    <Skeleton class="h-64" />
  {:else if error && items.length === 0}
    <p class="text-[13px] text-muted-foreground">Couldn't load notifications. <button type="button" class="underline" onclick={() => load()}>Try again</button></p>
  {:else if shown.length === 0}
    <p class="py-10 text-center text-[13px] text-muted-foreground">Nothing here yet.</p>
  {:else}
    <section class="flex flex-col gap-0.5 rounded-[10px] border border-border bg-card p-1.5">
      {#each unread as n (n.id)}{@render row(n)}{/each}
      {#if unread.length && earlier.length}<div class="px-3.5 pt-2.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Earlier</div>{/if}
      {#each earlier as n (n.id)}{@render row(n)}{/each}
    </section>
    {#if next}<button type="button" onclick={() => load(true)} class="h-8 self-center rounded-[9px] border border-border px-3 text-xs">Show more</button>{/if}
  {/if}
  <p class="text-xs text-muted-foreground">The same list as the phone's inbox. Coaching messages stay under My coach and Messages.</p>
</div>
