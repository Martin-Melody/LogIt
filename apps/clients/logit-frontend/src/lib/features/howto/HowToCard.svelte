<!-- One how-to (canvas HT1/HT2): pictures, a video, three cues, the most common mistake and the
     coach's note. Short in the workout (no pictures), whole on the sofa. -->
<script lang="ts">
  import VideoEmbed from "$lib/features/exercise/components/VideoEmbed.svelte";
  import type { ExerciseHowTo } from "@logit/core/domain/howTo";

  const { howTo, coachName = null, short = false }: { howTo: ExerciseHowTo; coachName?: string | null; short?: boolean } = $props();
</script>

<div class="flex flex-col gap-3.5">
  {#if !short && howTo.pictures.length}
    <div class="flex gap-2 overflow-x-auto">
      {#each howTo.pictures as src, i (src)}<img {src} alt="{howTo.exerciseName}, picture {i + 1}" class="h-44 w-auto shrink-0 rounded-xl object-cover" loading="lazy" />{/each}
    </div>
  {/if}
  {#if howTo.video}<VideoEmbed video={howTo.video} title="{howTo.exerciseName}, how it's done" />{/if}
  {#if howTo.cues.length}
    <section class="flex flex-col gap-2" aria-label="Three things">
      <h3 class="text-[15px] font-semibold">{howTo.cues.length === 3 ? "Three things" : "How to do it"}</h3>
      <ol class="flex flex-col gap-2">
        {#each howTo.cues as cue, i (i)}
          <li class="flex gap-3 text-[15px] leading-snug"><span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold">{i + 1}</span><span>{cue}</span></li>
        {/each}
      </ol>
    </section>
  {:else}
    <p class="text-sm text-muted-foreground">No steps written for this one yet.</p>
  {/if}
  {#if howTo.mistake}
    <p class="rounded-xl bg-warning/10 px-3.5 py-2.5 text-sm"><b class="font-semibold">Most common mistake:</b> {howTo.mistake}</p>
  {/if}
  {#if howTo.note}
    <p class="rounded-xl border border-border px-3.5 py-2.5 text-sm"><b class="font-semibold">From {coachName ?? "your coach"}:</b> "{howTo.note}"</p>
  {/if}
</div>
