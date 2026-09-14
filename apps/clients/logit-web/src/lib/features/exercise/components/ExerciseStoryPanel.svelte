<script lang="ts">
  // The narrative half of an ExerciseProgressStory — status, headline, next-session
  // target, reasoning, nudge, plateau next-steps. Factored out of ExerciseProgressionPanel
  // so a page that already renders its own metrics/chart (e.g. /exercises/[id]) can embed
  // just the story, while /progress's detail pane uses the full panel.
  import ProgressStatusChip from "./ProgressStatusChip.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import type { ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";

  const {
    story,
    onDismissNudge,
    onAcceptNudge,
  }: {
    story: ExerciseProgressStory;
    onDismissNudge: (nudgeId: string) => void;
    onAcceptNudge: (nudgeId: string) => void;
  } = $props();
</script>

<div class="flex flex-col gap-2 rounded-lg border border-border px-3 py-3">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <ProgressStatusChip status={story.status} />
      <ReasoningDialog reasoning={story.trendReasoning} />
    </div>
    <span class="text-xs text-muted-foreground">{story.statusDetail}</span>
  </div>
  {#if story.nextTarget}
    <div class="flex items-center gap-2 flex-wrap">
      <p class="text-sm">
        <span class="text-muted-foreground">Next session:</span>
        <span class="font-medium">{story.nextTarget}</span>
      </p>
      {#if story.suggestionReasoning}
        <ReasoningDialog reasoning={story.suggestionReasoning} />
      {/if}
    </div>
  {/if}
  {#if story.nextNote}
    <p class="text-xs text-amber-600 dark:text-amber-400">{story.nextNote}</p>
  {/if}
  {#if story.nudge}
    <div class="flex items-start gap-2 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1.5">
      <p class="flex-1 text-xs text-sky-700 dark:text-sky-400">{story.nudge.message}</p>
      <div class="flex shrink-0 items-center gap-2">
        {#if story.nudge.actionLabel}
          <button
            type="button"
            class="text-xs font-medium text-sky-700 dark:text-sky-400 underline underline-offset-2"
            onclick={() => onAcceptNudge(story.nudge!.id)}
          >
            {story.nudge.actionLabel}
          </button>
        {/if}
        <button
          type="button"
          class="text-xs text-sky-700 dark:text-sky-400 underline underline-offset-2"
          onclick={() => onDismissNudge(story.nudge!.id)}
        >
          {story.nudge.actionLabel ? "Not now" : "Got it"}
        </button>
      </div>
    </div>
  {/if}
  {#if story.lastPr}
    <p class="text-xs text-muted-foreground">
      Last PR {story.lastPr.value} ·
      {new Date(story.lastPr.whenMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </p>
  {/if}
  {#if story.plateauNextSteps}
    <!-- §10.3.2 — the rep-range ladder ran out of rungs with no real
         difference. Presents the remaining hypotheses as options, not
         a decision made for the user (Martin's call). -->
    <div class="rounded border border-border px-2 py-1.5">
      <p class="text-xs text-muted-foreground mb-1">
        Rep-range experiments didn't find a difference here. Worth checking next:
      </p>
      <div class="flex flex-wrap gap-3">
        {#if story.plateauNextSteps.muscleGroup}
          <a href="/progress?tab=muscles" class="text-xs font-medium text-sky-700 dark:text-sky-400 underline underline-offset-2">
            {story.plateauNextSteps.muscleGroup} volume/frequency
          </a>
        {/if}
        <a href="/progress?tab=nutrition" class="text-xs font-medium text-sky-700 dark:text-sky-400 underline underline-offset-2">
          Nutrition timing
        </a>
      </div>
    </div>
  {/if}
</div>
