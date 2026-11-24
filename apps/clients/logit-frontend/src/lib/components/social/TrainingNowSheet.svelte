<!-- Tapping someone who's training (design canvas T1): who, what and how long, Cheer and their
     profile. A cheer is one tap; the server lets one per workout through. -->
<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";
  import { minutesIn } from "$lib/features/friends/trainingPresence";
  import { goto } from "$app/navigation";
  import { ThumbsUp } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { trainingApi, type TrainingFriend } from "@logit/core/api/trainingApi";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";

  const { friend, onclose }: { friend: TrainingFriend; onclose: () => void } = $props();
  let state = $state<"idle" | "sending" | "sent">("idle");

  const minutes = $derived(minutesIn(friend, Date.now()));

  async function cheer() {
    state = "sending";
    try {
      await trainingApi.cheer(friend.username);
      state = "sent";
    } catch (e) {
      state = "idle";
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't send that. Try again.");
    }
  }
</script>

<BottomSheet label="{friend.displayName} is training" {onclose}>
  <div class="flex flex-col gap-4 px-4 pb-2">
    <div class="flex items-center gap-3">
      <span class="relative flex size-[52px] shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
        {#if friend.avatarUrl}<img src={photoSrc(friend.avatarUrl)} alt="" class="size-full rounded-full object-cover" />{:else}{friend.displayName.charAt(0).toUpperCase()}{/if}
        <span class="absolute bottom-0 right-0 size-4 rounded-full border-[3px] border-card bg-success" aria-hidden="true"></span>
      </span>
      <span class="flex flex-col gap-0.5">
        <span class="text-[17px] font-semibold">{friend.displayName} is training</span>
        <span class="text-sm tabular-nums text-muted-foreground">{friend.what ?? "A workout"} · {minutes} min in</span>
      </span>
    </div>
    <button type="button" disabled={state !== "idle"} onclick={cheer}
      class="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity disabled:opacity-60">
      <ThumbsUp class="size-[18px]" />{state === "sent" ? `Cheered ${friend.displayName} on` : `Cheer ${friend.displayName} on`}
    </button>
    <button type="button" class="h-11 rounded-lg border border-border text-sm font-medium" onclick={() => { onclose(); void goto(`/social/${friend.username}`); }}>View profile</button>
    <p class="text-[13px] leading-snug text-muted-foreground">{friend.displayName} gets a small "is cheering you on" and a light buzz; nothing to reply to.</p>
  </div>
</BottomSheet>
