<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { CoachHabit } from "@logit/core/domain/CoachHabit";
  import { coachHabitAsHabit, updateCoachHabit } from "@logit/core/domain/CoachHabit";
  import type { HabitCadence, HabitEntry } from "@logit/core/domain/habit";
  import { adherence, computeStreak, dueOn, isSatisfied } from "@logit/core/domain/habit";
  import { addDays } from "@logit/core/domain/dateIso";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { getWebCoachHabitRepo, fetchClientHabitEntries } from "$lib/deps";

  const clientId = $derived(page.params.id!);
  const habitId = $derived(page.params.habitId!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let habit = $state<CoachHabit | null>(null);
  let entries = $state<HabitEntry[]>([]);

  const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const today = localDateIso();

  const asHabit = $derived(habit ? coachHabitAsHabit(habit) : null);
  const streak = $derived(asHabit ? computeStreak(asHabit, entries, today) : 0);
  const month = $derived(
    asHabit ? adherence(asHabit, entries, addDays(today, -29), today) : null,
  );
  const last14 = $derived(
    asHabit
      ? Array.from({ length: 14 }, (_, i) => {
          const d = addDays(today, -(13 - i));
          return {
            d,
            due: dueOn(asHabit!, d),
            done: isSatisfied(asHabit!, entries.find((e) => e.dateIso === d)),
          };
        })
      : [],
  );

  async function load() {
    loading = true;
    error = null;
    try {
      const [row, ents] = await Promise.all([
        getWebCoachHabitRepo().getMine(habitId),
        fetchClientHabitEntries(clientId).catch(() => [] as HabitEntry[]),
      ]);
      habit = row?.habit ?? null;
      entries = ents.filter((e) => e.habitId === habitId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  async function run(patch: Partial<CoachHabit>) {
    if (!habit) return;
    const next = updateCoachHabit(habit, patch);
    habit = next;
    saving = true;
    error = null;
    try {
      await getWebCoachHabitRepo().saveHabit(next, username || undefined);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  function setCadence(kind: HabitCadence["kind"]) {
    if (kind === "daily") return run({ cadence: { kind: "daily" } });
    if (kind === "weekly")
      return run({
        cadence: { kind: "weekly", timesPerWeek: habit?.cadence.kind === "weekly" ? habit.cadence.timesPerWeek : 3 },
      });
    return run({
      cadence: { kind: "days", days: habit?.cadence.kind === "days" ? habit.cadence.days : [1, 2, 3, 4, 5] },
    });
  }

  function toggleDay(d: number) {
    if (habit?.cadence.kind !== "days") return;
    const has = habit.cadence.days.includes(d);
    const days = has ? habit.cadence.days.filter((x) => x !== d) : [...habit.cadence.days, d].sort();
    if (days.length) void run({ cadence: { kind: "days", days } });
  }

  let confirmDeleteOpen = $state(false);
  async function removeHabit() {
    confirmDeleteOpen = false;
    try {
      await getWebCoachHabitRepo().deleteHabit(habitId);
      await goto(`/clients/${clientId}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete";
    }
  }

  $effect(() => {
    void habitId;
    void load();
  });
</script>

<div class="flex flex-col gap-4 max-w-2xl">
  <div class="flex items-center justify-between">
    <a href="/clients/{clientId}?u={username}" class="text-xs text-muted-foreground hover:text-foreground">&larr; @{username}</a>
    {#if habit}
      <AlertDialog.Root bind:open={confirmDeleteOpen}>
        <AlertDialog.Trigger>
          {#snippet child({ props })}
            <Button {...props} size="sm" variant="outline" class="text-destructive">Delete</Button>
          {/snippet}
        </AlertDialog.Trigger>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Delete this habit?</AlertDialog.Title>
            <AlertDialog.Description>It's removed for the client too. Their past check-offs are kept.</AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <Button variant="destructive" onclick={() => void removeHabit()}>Delete</Button>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog.Root>
    {/if}
  </div>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {/if}

  {#if loading}
    <div class="flex flex-col gap-2"><Skeleton class="h-8 w-64" /><Skeleton class="h-40 w-full" /></div>
  {:else if !habit}
    <p class="text-sm text-muted-foreground">Habit not found.</p>
  {:else}
    <Card.Root>
      <Card.Header class="pb-2">
        <div class="flex items-center gap-3">
          <input
            class="text-lg font-semibold bg-transparent border-b border-transparent focus:border-primary focus:outline-none flex-1"
            value={habit.name}
            onblur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== habit?.name) void run({ name: v }); }}
          />
          <span class="text-xs text-muted-foreground">{saving ? "saving…" : "saved"}</span>
        </div>
      </Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-3">
        <label class="text-sm flex items-center gap-2">
          <span class="text-muted-foreground">Cadence</span>
          <select value={habit.cadence.kind} class="rounded border bg-background px-2 py-1 text-sm"
            onchange={(e) => void setCadence(e.currentTarget.value as HabitCadence["kind"])}>
            <option value="daily">Every day</option>
            <option value="days">Specific days</option>
            <option value="weekly">Times per week</option>
          </select>
        </label>

        {#if habit.cadence.kind === "days"}
          <div class="flex gap-1">
            {#each WEEKDAYS as label, d (d)}
              <button type="button"
                class="h-8 flex-1 rounded text-xs font-medium {habit.cadence.days.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
                onclick={() => toggleDay(d)}>{label}</button>
            {/each}
          </div>
        {:else if habit.cadence.kind === "weekly"}
          <label class="text-sm flex items-center gap-2">
            <input type="number" min="1" max="7" class="w-16 rounded border bg-background px-2 py-1 text-sm"
              value={habit.cadence.timesPerWeek}
              onchange={(e) => void run({ cadence: { kind: "weekly", timesPerWeek: Math.max(1, Math.min(7, Number(e.currentTarget.value) || 1)) } })} />
            <span class="text-muted-foreground">times per week</span>
          </label>
        {/if}

        <label class="text-sm flex items-center gap-2">
          <input type="checkbox" checked={!!habit.target}
            onchange={(e) => void run({ target: e.currentTarget.checked ? { value: habit?.target?.value || 1, unit: habit?.target?.unit } : undefined })} />
          <span>Track a number</span>
        </label>
        {#if habit.target}
          <div class="flex items-center gap-2 text-sm">
            <input type="number" min="0" class="w-20 rounded border bg-background px-2 py-1"
              value={habit.target.value}
              onchange={(e) => void run({ target: { value: Number(e.currentTarget.value) || 0, unit: habit?.target?.unit } })} />
            <input class="w-28 rounded border bg-background px-2 py-1" placeholder="unit (e.g. glasses)"
              value={habit.target.unit ?? ""}
              onblur={(e) => void run({ target: { value: habit?.target?.value || 0, unit: e.currentTarget.value.trim() || undefined } })} />
            <span class="text-muted-foreground">per day</span>
          </div>
        {/if}

        <label class="flex flex-col gap-1 text-sm">
          <span class="text-muted-foreground">Note to the client (optional)</span>
          <textarea rows="2" class="rounded border border-border bg-background px-2 py-1.5"
            value={habit.note ?? ""}
            onblur={(e) => void run({ note: e.currentTarget.value.trim() || undefined })}></textarea>
        </label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>Adherence</Card.Title>
        <Card.Description>
          {#if month}{Math.round(month.pct * 100)}% over the last 30 days ({month.satisfied}/{month.due}){:else}No data yet{/if}
          · {streak} day streak
        </Card.Description>
      </Card.Header>
      <Card.Content class="pt-0">
        <div class="flex gap-1">
          {#each last14 as day (day.d)}
            <div class="flex-1 flex flex-col items-center gap-1">
              <div class="h-6 w-full rounded {day.done ? 'bg-primary' : day.due ? 'bg-muted border border-border' : 'bg-transparent border border-dashed border-border'}"></div>
              <span class="text-[10px] text-muted-foreground">{day.d.slice(8)}</span>
            </div>
          {/each}
        </div>
        {#if entries.length === 0}
          <p class="text-xs text-muted-foreground mt-3">
            No check-offs synced yet. The client sees this habit in their app; adherence
            appears here once they check it off (requires the client on a Pro plan).
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
