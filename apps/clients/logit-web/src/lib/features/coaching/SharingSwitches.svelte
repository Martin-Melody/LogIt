<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { SHARE_AREAS, pastTrainingText, type ShareArea, type Sharing } from "@logit/core/api/coachApi";
  import { getWebDeps } from "$lib/deps";

  // The "what your coach can see" switches. Used when asking a coach (invite link), when
  // accepting an invite, and in My coach.

  let { sharing, disabled = false, onchange }: {
    sharing: Sharing;
    disabled?: boolean;
    onchange: (next: Sharing) => void;
  } = $props();

  function flip(key: ShareArea) {
    onchange({ ...sharing, [key]: !sharing[key] });
  }

  // Canvas SP3: "Your training from before", with the real count. No workouts: no row.
  let past = $state<{ count: number; sinceMs: number | null } | null>(null);
  onMount(() => {
    void getWebDeps().workoutRepo.listAllSessions().then((s) => {
      const done = s.filter((x) => x.endedAtMs != null);
      past = { count: done.length, sinceMs: done.length ? Math.min(...done.map((x) => x.startedAtMs)) : null };
    }, () => {});
  });
  const pastOn = $derived(sharing.pastTraining !== false);
</script>

<div class="flex flex-col">
  {#each SHARE_AREAS as a (a.key)}
    <div class="flex items-center justify-between gap-2.5 border-t border-border py-2.5 text-[13px]">
      <span id="share-{a.key}">{a.label}</span>
      <button type="button" role="switch" aria-checked={sharing[a.key]} aria-labelledby="share-{a.key}" {disabled} onclick={() => flip(a.key)}
        class="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 {sharing[a.key] ? 'bg-success' : 'bg-muted-foreground/30'}">
        <span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {sharing[a.key] ? 'right-0.5' : 'left-0.5'}"></span>
      </button>
    </div>
    {#if a.key === "workouts" && sharing.workouts && past && past.count > 0}
      <div transition:slide={{ duration: 160 }} class="flex items-center justify-between gap-2.5 border-t border-border py-2.5 pl-4 text-[13px]">
        <span class="flex flex-col"><span id="share-past">Your training from before</span>
          <span class="text-xs text-muted-foreground">{pastOn ? pastTrainingText(past.count, past.sinceMs) : "Off: they see only workouts from today on."} Change it any time in My coach.</span></span>
        <button type="button" role="switch" aria-checked={pastOn} aria-labelledby="share-past" {disabled} onclick={() => onchange({ ...sharing, pastTraining: !pastOn })}
          class="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 {pastOn ? 'bg-success' : 'bg-muted-foreground/30'}">
          <span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {pastOn ? 'right-0.5' : 'left-0.5'}"></span>
        </button>
      </div>
    {/if}
  {/each}
  <div class="flex items-center justify-between gap-2.5 border-t border-border py-2.5 text-[13px]">
    <span class="text-muted-foreground">Social posts and other messages</span>
    <span class="text-xs text-muted-foreground">Never</span>
  </div>
</div>
