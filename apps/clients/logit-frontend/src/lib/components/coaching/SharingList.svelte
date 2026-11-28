<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { SHARE_AREAS, pastTrainingText, type ShareArea, type Sharing } from "@logit/core/api/coachApi";
  import { getWorkoutRepo } from "$lib/data/repoProvider";

  // "What your coach can see": one switch per kind of data. Same list as the web's My coach.

  const { sharing, disabled = false, onchange }: { sharing: Sharing; disabled?: boolean; onchange: (next: Sharing) => void } = $props();

  function flip(key: ShareArea, on: boolean) {
    onchange({ ...sharing, [key]: on });
  }

  // Canvas SP3: "Your training from before", with the real count. No workouts: no row.
  let past = $state<{ count: number; sinceMs: number | null } | null>(null);
  onMount(() => {
    void getWorkoutRepo().listAllSessions().then((s) => {
      const done = s.filter((x) => x.endedAtMs != null);
      past = { count: done.length, sinceMs: done.length ? Math.min(...done.map((x) => x.startedAtMs)) : null };
    }, () => {});
  });
  const pastOn = $derived(sharing.pastTraining !== false);
</script>

<ul class="divide-y divide-border">
  {#each SHARE_AREAS as a (a.key)}
    <li class="flex items-center justify-between gap-3 px-3 text-sm">
      <span>{a.label}</span>
      <Switch checked={sharing[a.key]} label={a.label} {disabled} onchange={(v) => flip(a.key, v)} />
    </li>
    {#if a.key === "workouts" && sharing.workouts && past && past.count > 0}
      <li transition:slide={{ duration: 160 }} class="flex items-center justify-between gap-3 py-2 pl-6 pr-3 text-sm">
        <span class="flex flex-col"><span>Your training from before</span>
          <span class="text-xs text-muted-foreground">{pastOn ? pastTrainingText(past.count, past.sinceMs) : "Off: they see only workouts from today on."}</span></span>
        <Switch checked={pastOn} label="Your training from before" {disabled} onchange={(v) => onchange({ ...sharing, pastTraining: v })} />
      </li>
    {/if}
  {/each}
  <li class="flex items-center justify-between gap-3 px-3 py-3 text-sm">
    <span class="text-muted-foreground">Social posts and other messages</span>
    <span class="text-xs text-muted-foreground">Never</span>
  </li>
</ul>
