<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Plus } from "lucide-svelte";

  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { createCoachProgram } from "@logit/core/domain/CoachProgram";
  import type { CheckinSchedule } from "@logit/core/domain/Checkin";
  import { createCheckinSchedule } from "@logit/core/domain/Checkin";
  import { getAuthoredProgramRepo, getAuthoredCheckinRepo } from "$lib/data/repoProvider";
  import { saveAuthoredProgram } from "$lib/usecases/coach/saveAuthoredProgram";
  import { saveAuthoredCheckin } from "$lib/usecases/coach/saveAuthoredCheckin";

  const clientId = $derived($page.params.id ?? "");
  const username = $derived($page.url.searchParams.get("u") ?? "");

  const ui = $state({ loading: true, creating: false, error: null as string | null });
  let programs = $state<CoachProgram[]>([]);
  let checkins = $state<CheckinSchedule[]>([]);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      if (!username) { programs = []; checkins = []; return; }
      [programs, checkins] = await Promise.all([
        getAuthoredProgramRepo().listForRecipient(username),
        getAuthoredCheckinRepo().listForRecipient(username),
      ]);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function newProgram() {
    if (ui.creating || !username) return;
    ui.creating = true;
    try {
      const p = createCoachProgram(`${username}'s program`);
      await saveAuthoredProgram(p, username);
      await goto(`/clients/${clientId}/programs/${p.id}?u=${username}`);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to create program";
      ui.creating = false;
    }
  }

  async function newCheckin() {
    if (ui.creating || !username) return;
    ui.creating = true;
    try {
      const s = createCheckinSchedule("Weekly check-in");
      await saveAuthoredCheckin(s, username);
      await goto(`/clients/${clientId}/checkins/${s.id}?u=${username}`);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to create check-in";
      ui.creating = false;
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/clients")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold truncate">@{username}</p>
      <p class="text-xs text-muted-foreground">Client</p>
    </div>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Programs</span>
      <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1" disabled={ui.creating} onclick={() => void newProgram()}>
        <Plus class="h-3 w-3" /> New
      </Button>
    </div>
    {#if programs.length === 0}
      <p class="px-3 py-3 text-sm text-muted-foreground">No programs yet.</p>
    {:else}
      <ul class="divide-y divide-border">
        {#each programs as p (p.id)}
          <li class="flex items-center">
            <button type="button" class="flex-1 min-w-0 px-3 py-3 text-left hover:bg-muted/40"
              onclick={() => void goto(`/clients/${clientId}/programs/${p.id}?u=${username}`)}>
              <span class="text-sm font-medium">{p.name}</span>
              <p class="text-xs text-muted-foreground mt-0.5">{p.weeks.length} week{p.weeks.length === 1 ? "" : "s"}</p>
            </button>
            <span class="text-muted-foreground text-sm pr-3">›</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="flex items-center justify-between px-3 py-2 border-b border-t border-border mt-2">
      <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Check-ins</span>
      <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1" disabled={ui.creating} onclick={() => void newCheckin()}>
        <Plus class="h-3 w-3" /> New
      </Button>
    </div>
    {#if checkins.length === 0}
      <p class="px-3 py-3 text-sm text-muted-foreground">No check-ins yet.</p>
    {:else}
      <ul class="divide-y divide-border">
        {#each checkins as c (c.id)}
          <li class="flex items-center">
            <button type="button" class="flex-1 min-w-0 px-3 py-3 text-left hover:bg-muted/40"
              onclick={() => void goto(`/clients/${clientId}/checkins/${c.id}?u=${username}`)}>
              <span class="text-sm font-medium">{c.name}</span>
              <p class="text-xs text-muted-foreground mt-0.5 capitalize">{c.cadence} · {c.questions.length} question{c.questions.length === 1 ? "" : "s"}</p>
            </button>
            <span class="text-muted-foreground text-sm pr-3">›</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
