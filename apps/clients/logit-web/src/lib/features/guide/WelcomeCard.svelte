<!-- First visit after getting Pro or Studio (and once for accounts that already had it):
     offers the walkthrough. Shown on Overview (Pro) and Today (Studio) until started or hidden. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Walkthrough } from "@logit/core/guide/types";
  import { guide, chaptersOf } from "./guide.svelte";

  let { walkthrough, name }: { walkthrough: Exclude<Walkthrough, "app">; name: string } = $props();

  const chapters = $derived(chaptersOf(walkthrough));
  const minutes = $derived(chapters.reduce((n, c) => n + c.minutes, 0));
  const next = $derived(guide.nextChapter(walkthrough));
  const started = $derived(guide.doneCount(walkthrough) > 0);
  const show = $derived(guide.loaded && chapters.length > 0 && next !== null && !guide.welcomed(walkthrough));
</script>

{#if show && next}
  <section class="flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-card p-5" aria-labelledby="welcome-{walkthrough}">
    <div class="min-w-0 flex-[1_1_360px]">
      <h2 id="welcome-{walkthrough}" class="text-[17px] font-bold">
        {walkthrough === "studio" ? `Welcome to Studio, ${name}` : `Welcome to Pro, ${name}`}
      </h2>
      <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {#if walkthrough === "studio"}
          The walkthrough has you do each part of coaching for real: an invite link, a program, a check-in, messages. Sample clients can play your clients.
        {:else}
          Workouts from your phone sync here. The walkthrough shows each part of the dashboard on your own data, one chapter at a time.
        {/if}
        {chapters.length} chapters, about {minutes} minutes in all. Stop whenever you like; Guide remembers where you were.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button onclick={() => guide.start(next.id)}>{started ? `Continue: ${next.title}` : "Start the walkthrough"}</Button>
      <Button variant="outline" onclick={() => guide.dismissWelcome(walkthrough)}>Hide this</Button>
    </div>
  </section>
{/if}
