<script lang="ts">
  import { onMount } from "svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Sharing } from "@logit/core/api/coachApi";
  import type { CoachHabit } from "@logit/core/domain/CoachHabit";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { fetchClientHabitEntries } from "@logit/core/data/remote/remoteCoachHabitRepo";
  import type { HabitEntry } from "@logit/core/domain/habit";
  import { getWebCoachHabitRepo } from "$lib/deps";
  import NotShared from "./NotShared.svelte";
  import AddHabitDialog from "./AddHabitDialog.svelte";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { Button } from "$lib/components/ui/button";
  import { coachHabitAsHabit } from "@logit/core/domain/CoachHabit";
  import { weekSquares } from "@logit/core/domain/habit";

  let { clientId, username, name, sharing }: { clientId: string; username: string; name: string; sharing: Sharing } = $props();

  let habits = $state<CoachHabit[]>([]);
  let entries = $state<HabitEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let adding = $state(false);
  let preset = $state<{ name: string; cadence: CoachHabit["cadence"] } | null>(null);
  // Canvas X4: Edit… · Give to other clients… | Remove (undo).
  const habitActions = (h: CoachHabit): RowAction[] => [
    { id: "edit", label: "Edit…", href: `/clients/${clientId}/habits/${h.id}?u=${username}` },
    { id: "give", label: "Give to other clients…", run: () => { preset = { name: h.name, cadence: h.cadence }; adding = true; } },
    { id: "remove", label: "Remove", danger: true, separatorBefore: true, run: () => void removeHabit(h) },
  ];
  async function removeHabit(h: CoachHabit) {
    const repo = getWebCoachHabitRepo();
    try {
      await repo.saveHabit({ ...h, archived: true, updatedAtMs: Date.now() }, username);
      habits = habits.filter((x) => x.id !== h.id);
      toast.success(`Removed ${h.name}`, { action: { label: "Undo", onClick: () => void repo.saveHabit({ ...h, archived: false, updatedAtMs: Date.now() }, username).then(load) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove it");
    }
  }

  async function load() {
    try {
      habits = (await getWebCoachHabitRepo().listForRecipient(clientId)).map((h) => h.habit).filter((h) => !h.archived);
      if (sharing.habits) entries = await fetchClientHabitEntries(clientId).catch(() => []);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load habits";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  const today = localDateIso();
  const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

  function cadence(h: CoachHabit): string {
    if (h.cadence.kind === "daily") return "Every day";
    if (h.cadence.kind === "weekly") return `${h.cadence.timesPerWeek}× a week`;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return h.cadence.days.slice().sort((a, b) => a - b).map((d) => names[d]).join(" · ");
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
        <Button variant="outline" size="sm" onclick={() => (adding = true)}>Add a habit</Button>
      </div>
      {#each habits as h (h.id)}
        {@const w = weekSquares(coachHabitAsHabit(h), entries, today)}
        <ActionMenu actions={habitActions(h)} label="More for {h.name}">
        {#snippet children({ props, more })}
        <div {...props} class="flex flex-wrap items-center gap-3 border-t border-border py-2.5 text-[13px]">
          <span class="flex min-w-[160px] flex-1 flex-col"><span class="font-medium">{h.icon ? `${h.icon} ` : ""}{h.name}</span><span class="text-xs text-muted-foreground">{cadence(h)}</span></span>
          {#if sharing.habits}
            <!-- The same day squares as the habit cards in their app (canvas K12). -->
            <span class="flex gap-1" role="img" aria-label="This week: {w.done} of {w.target}">
              {#each w.days as d, i (d.dateIso)}
                <span class="flex size-6 items-center justify-center rounded-md text-[10px] font-semibold {d.done ? 'bg-success text-white' : d.future ? 'border border-dashed border-border text-muted-foreground' : d.due ? 'bg-muted text-muted-foreground' : 'text-muted-foreground/50'}">{LETTERS[i]}</span>
              {/each}
            </span>
            <span class="w-14 text-right text-xs tabular-nums text-muted-foreground">{w.done} of {w.target}</span>
          {/if}
          <Button variant="outline" size="sm" href="/clients/{clientId}/habits/{h.id}?u={username}">Edit</Button>
          {@render more()}
        </div>
        {/snippet}
        </ActionMenu>
      {:else}
        <p class="border-t border-border py-3 text-[13px] text-muted-foreground">No habits yet. Steps, water, sleep, mobility: anything they should do regularly.</p>
      {/each}
    </section>
    {#if !sharing.habits}<NotShared {name} what="their habit check-offs" note="Your habits still reach their app." />{/if}
  </div>
{/if}

<AddHabitDialog bind:open={() => adding, (v) => { adding = v; if (!v) preset = null; }} {clientId} {preset} onsaved={() => void load()} />
