<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
  import type { MyCheckinSchedule } from "@logit/core/data/checkinRepo";
  import { createCoachProgram } from "@logit/core/domain/CoachProgram";
  import { createCheckinSchedule } from "@logit/core/domain/Checkin";
  import { getWebCoachProgramRepo, getWebCheckinRepo } from "$lib/deps";

  const clientId = $derived(page.params.id!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let loading = $state(true);
  let creating = $state(false);
  let error = $state<string | null>(null);
  let programs = $state<MyCoachProgram[]>([]);
  let checkins = $state<MyCheckinSchedule[]>([]);

  async function load() {
    loading = true;
    error = null;
    try {
      [programs, checkins] = await Promise.all([
        getWebCoachProgramRepo().listMyPrograms({ recipientId: clientId }),
        getWebCheckinRepo().listMySchedules({ recipientId: clientId }),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  async function newProgram() {
    if (creating || !username) return;
    creating = true;
    error = null;
    try {
      const p = createCoachProgram(`${username}'s program`);
      await getWebCoachProgramRepo().saveProgram(p, username);
      await goto(`/clients/${clientId}/programs/${p.id}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create program";
      creating = false;
    }
  }

  async function newCheckin() {
    if (creating || !username) return;
    creating = true;
    error = null;
    try {
      const s = createCheckinSchedule("Weekly check-in");
      await getWebCheckinRepo().saveSchedule(s, username);
      await goto(`/clients/${clientId}/checkins/${s.id}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create check-in";
      creating = false;
    }
  }

  $effect(() => {
    void clientId;
    void load();
  });
</script>

<div class="flex flex-col gap-4 max-w-3xl">
  <div>
    <a href="/clients" class="text-xs text-muted-foreground hover:text-foreground">&larr; Clients</a>
    <h1 class="text-lg font-semibold mt-1">@{username}</h1>
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <Card.Root>
    <Card.Header class="pb-2 flex-row items-start justify-between">
      <div>
        <Card.Title>Programs</Card.Title>
        <Card.Description>Training programs you've assigned to this client.</Card.Description>
      </div>
      <Button size="sm" disabled={creating} onclick={newProgram}>
        {#if creating}<Spinner class="size-4" />{/if}
        New
      </Button>
    </Card.Header>
    <Card.Content class="pt-0 pb-2">
      {#if loading}
        <p class="text-sm text-muted-foreground py-2">Loading…</p>
      {:else if programs.length === 0}
        <p class="text-sm text-muted-foreground py-2">No programs yet.</p>
      {:else}
        {#each programs as { program } (program.id)}
          <a href="/clients/{clientId}/programs/{program.id}?u={username}"
            class="flex items-center justify-between py-2 border-b last:border-0 border-border text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
            <span class="font-medium">{program.name}</span>
            <span class="text-xs text-muted-foreground">{program.weeks.length} week{program.weeks.length === 1 ? "" : "s"}</span>
          </a>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2 flex-row items-start justify-between">
      <div>
        <Card.Title>Check-ins</Card.Title>
        <Card.Description>Recurring questionnaires this client fills in.</Card.Description>
      </div>
      <Button size="sm" variant="outline" disabled={creating} onclick={newCheckin}>New</Button>
    </Card.Header>
    <Card.Content class="pt-0 pb-2">
      {#if loading}
        <p class="text-sm text-muted-foreground py-2">Loading…</p>
      {:else if checkins.length === 0}
        <p class="text-sm text-muted-foreground py-2">No check-ins yet.</p>
      {:else}
        {#each checkins as { schedule } (schedule.id)}
          <a href="/clients/{clientId}/checkins/{schedule.id}?u={username}"
            class="flex items-center justify-between py-2 border-b last:border-0 border-border text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
            <span class="font-medium">{schedule.name}</span>
            <span class="text-xs text-muted-foreground capitalize">{schedule.cadence} · {schedule.questions.length}q</span>
          </a>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>
</div>
