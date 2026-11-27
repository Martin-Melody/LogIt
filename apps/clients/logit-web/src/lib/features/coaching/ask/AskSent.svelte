<!-- After asking (canvas P2 → A1): what happens next, and the conversation as the next step. -->
<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import { Button } from "$lib/components/ui/button";

  let { coachName, relationshipId, waiting = false }: { coachName: string; relationshipId: string; waiting?: boolean } = $props();
  const first = $derived(coachName.trim().split(/\s+/)[0] || coachName);
</script>

<div class="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
  <div class="flex items-center gap-3">
    <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon class="size-5" aria-hidden="true" /></span>
    <h2 class="text-lg font-bold">{waiting ? `You're on ${first}'s waiting list` : `Sent to ${first}`}</h2>
  </div>
  <p class="text-[14px] leading-relaxed text-muted-foreground">
    {waiting
      ? `${first} reads your answers when a spot opens and offers it to you in your conversation. Nothing is shared until you take it.`
      : `${first} reads your answers and replies in your conversation: a question, an offer of a spot, or a waiting list. Nothing is shared and nothing is paid until you take a spot.`}
  </p>
  <Button href="/social/messages?c={relationshipId}" size="lg" class="h-11">Open the conversation</Button>
</div>
