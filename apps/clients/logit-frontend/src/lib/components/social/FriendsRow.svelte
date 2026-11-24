<!-- The row of circles above the feed (design canvas S1). For now: friends training right now,
     each with the green dot; stories join this row later. Tapping one opens TrainingNowSheet. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { trainingApi, type TrainingFriend } from "@logit/core/api/trainingApi";
  import { popIn } from "$lib/transitions";
  import TrainingNowSheet from "./TrainingNowSheet.svelte";

  let friends = $state<TrainingFriend[]>([]);
  let open = $state<TrainingFriend | null>(null);

  async function load() {
    try {
      friends = await trainingApi.friends();
    } catch {
      // Keep what's shown; the next refresh tries again.
    }
  }
  onMount(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(timer);
  });
</script>

{#if friends.length > 0}
  <section aria-label="Training now" class="flex gap-3.5 overflow-x-auto border-b border-border px-3 pb-2.5 pt-1" data-no-tab-swipe>
    {#each friends as f (f.id)}
      <button type="button" in:popIn class="flex w-[68px] shrink-0 flex-col items-center gap-1.5" aria-label="{f.displayName}, training now" onclick={() => (open = f)}>
        <span class="relative flex size-16 items-center justify-center rounded-full bg-muted text-lg font-semibold">
          {#if f.avatarUrl}<img src={f.avatarUrl} alt="" class="size-full rounded-full object-cover" />{:else}{f.displayName.charAt(0).toUpperCase()}{/if}
          <span class="absolute bottom-0.5 right-0.5 size-4 rounded-full border-[3px] border-background bg-success" aria-hidden="true"></span>
        </span>
        <span class="max-w-full truncate text-[11px] font-medium">{f.displayName}</span>
      </button>
    {/each}
  </section>
{/if}

{#if open}
  <TrainingNowSheet friend={open} onclose={() => (open = null)} />
{/if}
