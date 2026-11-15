<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Sharing } from "@logit/core/api/coachApi";
  import { createCoachHabit, type CoachHabit } from "@logit/core/domain/CoachHabit";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { fetchClientHabitEntries } from "@logit/core/data/remote/remoteCoachHabitRepo";
  import type { HabitEntry } from "@logit/core/domain/habit";
  import { getWebCoachHabitRepo } from "$lib/deps";
  import NotShared from "./NotShared.svelte";

  let { clientId, username, name, sharing }: { clientId: string; username: string; name: string; sharing: Sharing } = $props();

  let habits = $state<CoachHabit[]>([]);
  let entries = $state<HabitEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let creating = $state(false);

  onMount(async () => {
    try {
      habits = (await getWebCoachHabitRepo().listForRecipient(clientId)).map((h) => h.habit).filter((h) => !h.archived);
      if (sharing.habits) entries = await fetchClientHabitEntries(clientId).catch(() => []);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load habits";
    } finally {
      loading = false;
    }
  });

  // Last 28 days, today included, as YYYY-MM-DD.
  const days = $derived(Array.from({ length: 28 }, (_, i) => localDateIso(new Date(Date.now() - (27 - i) * 86_400_000))));

  function doneOn(h: CoachHabit, iso: string): boolean {
    return entries.some((e) => e.habitId === h.id && e.dateIso === iso && e.done);
  }

  function cadence(h: CoachHabit): string {
    if (h.cadence.kind === "daily") return "Every day";
    if (h.cadence.kind === "weekly") return `${h.cadence.timesPerWeek}× a week`;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return h.cadence.days.slice().sort((a, b) => a - b).map((d) => names[d]).join(" · ");
  }

  async function newHabit() {
    creating = true;
    try {
      const h = createCoachHabit("Habit");
      await getWebCoachHabitRepo().saveHabit(h, username);
      await goto(`/clients/${clientId}/habits/${h.id}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't create the habit";
      creating = false;
    }
  }
</script>

{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
{#if loading}
  <Skeleton class="h-48" />
{:else}
  <div class="flex flex-col gap-4">
    <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
      <div class="flex items-baseline justify-between pb-1.5">
        <div>
          <h2 class="text-sm font-semibold">Habits from you</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">They tick these off in their app under "From your coach".</p>
        </div>
        <button type="button" disabled={creating} onclick={newHabit} class="h-[30px] rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Add habit</button>
      </div>
      {#each habits as h (h.id)}
        {@const n = days.filter((d) => doneOn(h, d)).length}
        <a href="/clients/{clientId}/habits/{h.id}?u={username}" class="flex flex-wrap items-center gap-3 border-t border-border py-2.5 text-[13px] hover:opacity-90">
          <span class="min-w-[160px] flex-1"><span class="font-medium">{h.icon ? `${h.icon} ` : ""}{h.name}</span> <span class="text-xs text-muted-foreground">· {cadence(h)}</span></span>
          {#if sharing.habits}
            <span class="flex gap-[3px]" role="img" aria-label="{n} of the last 28 days done">
              {#each days as d (d)}<span class="size-2.5 rounded-sm {doneOn(h, d) ? 'bg-success' : 'bg-muted'}"></span>{/each}
            </span>
            <span class="w-24 text-right text-xs text-muted-foreground">{n} of 28 days</span>
          {/if}
        </a>
      {:else}
        <p class="border-t border-border py-3 text-[13px] text-muted-foreground">No habits yet. Steps, water, sleep, mobility: anything they should do regularly.</p>
      {/each}
    </section>
    {#if !sharing.habits}<NotShared {name} what="their habit check-offs" note="Your habits still reach their app." />{/if}
  </div>
{/if}
