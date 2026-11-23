<script lang="ts">
  import { socialApi, type FollowStatus } from "@logit/core/api/socialApi";
  import { toast } from "$lib/components/ui/sonner";
  import { ApiError } from "@logit/core/api/client";

  // Follow / Request to follow (private accounts) / Requested / Following. Tapping Requested
  // withdraws the request; tapping Following unfollows.
  let {
    username,
    // Unset counts as "none" (lists bind each row's entry before it exists).
    status = $bindable(),
    isPrivate = false,
    followsYou = false,
    primary = false,
    class: className = "",
    onchange,
  }: {
    username: string;
    status?: FollowStatus | undefined;
    isPrivate?: boolean;
    /** They follow you: "Follow back". */
    followsYou?: boolean;
    primary?: boolean;
    class?: string;
    onchange?: (status: FollowStatus) => void;
  } = $props();

  let busy = $state(false);

  const current = $derived<FollowStatus>(status ?? "none");
  const label = $derived(
    current === "following" ? "Following" : current === "requested" ? "Requested" : isPrivate ? "Request to follow" : followsYou ? "Follow back" : "Follow",
  );

  async function toggle() {
    if (busy) return;
    busy = true;
    const before = current;
    try {
      if (before === "none") status = await socialApi.follow(username);
      else {
        await socialApi.unfollow(username);
        status = "none";
      }
      onchange?.(status ?? "none");
    } catch (e) {
      // Already following (e.g. a "Follow back" on someone you follow): that's the goal.
      if (e instanceof ApiError && e.status === 409) {
        status = "following";
        onchange?.(status ?? "none");
        return;
      }
      status = before;
      toast.error(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      busy = false;
    }
  }
</script>

<button type="button" onclick={toggle} disabled={busy}
  title={current === "requested" ? "Tap to withdraw the request" : undefined}
  class="h-8 shrink-0 rounded-[9px] px-3 text-xs font-semibold disabled:opacity-60 {current === 'none' && primary ? 'bg-primary text-primary-foreground' : 'border border-border'} {className}">{label}</button>
