<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ApiError, apiClient } from "@logit/core/api/client";
  import { coachApi, SHARE_ALL, type InviteLinkInfo, type Sharing } from "@logit/core/api/coachApi";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import SharingSwitches from "$lib/features/coaching/SharingSwitches.svelte";

  // Where a coach's invite link lands. Pick what the coach may see, then send a request
  // (or, if the coach already invited you by username, accept straight away).

  const code = $derived(page.params.code ?? "");
  let info = $state<InviteLinkInfo | null>(null);
  let error = $state<string | null>(null);
  let sharing = $state<Sharing>({ ...SHARE_ALL });
  let sending = $state(false);
  let done = $state<"requested" | "active" | null>(null);

  // Free accounts land here without the sidebar; they keep using the app for everything else.
  const isFree = !apiClient.isSelfHosted() && apiClient.getUser()?.tier === "Free";

  onMount(async () => {
    try {
      info = await coachApi.openLink(code);
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This link doesn't exist. Check it with your coach." : e instanceof Error ? e.message : "Couldn't open the link";
    }
  });

  const coachName = $derived(info ? info.coach.displayName || info.coach.username : "");

  async function send() {
    if (!info || sending) return;
    sending = true;
    error = null;
    try {
      if (info.relationship === "invited" && info.relationshipId) {
        await coachApi.acceptInvite(info.relationshipId, sharing);
        done = "active";
      } else {
        done = (await coachApi.requestCoaching(code, sharing)).status;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send the request";
    } finally {
      sending = false;
    }
  }

  const closedText = {
    off: "has been turned off",
    expired: "has expired",
    full: "has reached its limit",
  } as const;
</script>

<div class="mx-auto flex w-full max-w-md flex-col gap-4 py-6">
  {#if error && !info}
    <section class="rounded-[10px] border border-border bg-card p-5">
      <h1 class="text-lg font-bold">Invite link</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">{error}</p>
    </section>
  {:else if !info}
    <Skeleton class="h-80" />
  {:else}
    <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-5">
      <div class="flex items-center gap-3">
        <Avatar name={coachName} url={info.coach.avatarUrl} size={44} />
        <div>
          <h1 class="text-base font-bold">{info.isSelf ? "This is your own invite link" : `${coachName} wants to coach you`}</h1>
          <p class="text-xs text-muted-foreground">@{info.coach.username} on LogIt</p>
        </div>
      </div>

      {#if info.isSelf}
        <p class="text-[13px] text-muted-foreground">Share it with people you'd like to coach. Their requests show up in <a href="/coaching/links" class="text-primary hover:underline">Invite links</a>.</p>
      {:else if done === "active" || info.relationship === "active"}
        <p class="text-[13px]">{coachName} is your coach. Your program, check-ins and messages are in {isFree ? "the LogIt app" : "My coach"}.</p>
        {#if !isFree}<a href="/my-coach" class="h-10 rounded-[9px] bg-primary text-center text-[13px] font-semibold leading-10 text-primary-foreground">Open My coach</a>{/if}
      {:else if done === "requested" || info.relationship === "requested"}
        <p class="text-[13px]">Request sent. {coachName} will see it and say yes or no. You'll find them in {isFree ? "the LogIt app" : "My coach"} once they accept.</p>
        {#if !isFree}<a href="/my-coach" class="text-[13px] text-primary hover:underline">Change what you share or cancel the request in My coach ›</a>{/if}
      {:else if info.state !== "active" && info.relationship !== "invited"}
        <p class="text-[13px] text-muted-foreground">This link {closedText[info.state]}. Ask {coachName} for a new one.</p>
      {:else}
        <p class="text-[13px] leading-relaxed text-muted-foreground">
          {info.relationship === "invited" ? `${coachName} already invited you. ` : ""}Pick what {coachName} can see. You can change this any time in My coach.
        </p>
        <SharingSwitches {sharing} disabled={sending} onchange={(s) => (sharing = s)} />
        {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
        <button type="button" disabled={sending} onclick={send}
          class="h-10 rounded-[9px] bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
          {info.relationship === "invited" ? `Accept ${coachName} as my coach` : `Send request to ${coachName}`}
        </button>
      {/if}
    </section>
    {#if isFree}<p class="text-center text-xs text-muted-foreground">Coaching works on the free plan. Everything happens in the LogIt app.</p>{/if}
  {/if}
</div>
