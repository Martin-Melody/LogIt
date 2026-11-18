<!-- W4 · A lifter's first visits to the dashboard: no forced tour (the walkthrough card above
     offers one), just what the web does better than the phone. With under 3 workouts it also
     says the charts fill in as they train. Hidden for good once dismissed (per account). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { apiClient } from "@logit/core/api/client";

  let { sessions }: { sessions: number | null } = $props();

  const hideKey = `logit:big-screen-hidden:${apiClient.getUser()?.id ?? ""}`;
  let hidden = $state(true);

  onMount(() => {
    try {
      hidden = localStorage.getItem(hideKey) === "1";
    } catch {
      hidden = false;
    }
  });

  function hide() {
    hidden = true;
    try {
      localStorage.setItem(hideKey, "1");
    } catch {
      /* hidden for this visit */
    }
  }
</script>

{#if !hidden}
  <section class="flex flex-wrap items-center justify-between gap-3.5 rounded-[14px] border border-dashed border-border p-[18px]" aria-labelledby="big-screen-title">
    <div class="flex min-w-0 flex-col gap-1">
      <h2 id="big-screen-title" class="text-[15px] font-semibold">Things that are easier on a computer</h2>
      <p class="text-[13px] text-muted-foreground">Plan next week by dragging days · build your own progression · see every lift's trend side by side</p>
      {#if sessions !== null && sessions < 3}
        <p class="text-[13px] text-muted-foreground">
          {sessions === 0 ? "Your charts fill in as you train on your phone." : `${sessions} workout${sessions === 1 ? "" : "s"} so far.`}
          Trends show up after 3 workouts.
        </p>
      {/if}
    </div>
    <div class="flex items-center gap-3">
      <a href="/plan" class="rounded-[10px] bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground">Plan next week</a>
      <button type="button" class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onclick={hide}>Hide this</button>
    </div>
  </section>
{/if}
