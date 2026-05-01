<script lang="ts">
  import { onMount } from "svelte";
  import { Trophy } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { getPersonalRecords, type PersonalRecord } from "$lib/usecases/getPersonalRecords";
  import { profile } from "$lib/stores/profile.store";

  let records = $state<PersonalRecord[]>([]);
  let loading = $state(true);

  onMount(async () => {
    records = await getPersonalRecords(8);
    loading = false;
  });

  function fmtWeight(kg: number) {
    if ($profile.weightUnit === "lbs") return `${Math.round(kg * 2.20462)} lbs`;
    return `${kg} kg`;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm">Personal Records</Card.Title>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-xs text-muted-foreground">Loading…</p>
    {:else if records.length === 0}
      <div class="flex flex-col items-center gap-2 py-4 text-center">
        <Trophy class="h-6 w-6 text-muted-foreground/40" />
        <p class="text-xs text-muted-foreground">No completed sets recorded yet.<br />Finish a workout to see your records here.</p>
      </div>
    {:else}
      <ul class="flex flex-col divide-y divide-border">
        {#each records as pr (pr.exerciseName)}
          <li class="flex items-center justify-between py-1.5 text-sm">
            <span class="truncate text-foreground/90 max-w-[55%]">{pr.exerciseName}</span>
            <span class="font-medium tabular-nums shrink-0">{fmtWeight(pr.weight)} × {pr.reps}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
