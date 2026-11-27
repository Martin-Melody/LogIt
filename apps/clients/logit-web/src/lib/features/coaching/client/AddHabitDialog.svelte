<!-- Canvas K12: add a habit. Habits you've made before show as suggestions; "Give it to" can pick
     several clients (each gets their own copy, as a coach habit is one client's). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi } from "@logit/core/api/coachApi";
  import { createCoachHabit, updateCoachHabit } from "@logit/core/domain/CoachHabit";
  import type { HabitCadence } from "@logit/core/domain/habit";
  import { getWebCoachHabitRepo } from "$lib/deps";
  import { practice } from "$lib/features/guide/sandbox.svelte";

  let { open = $bindable(false), clientId, onsaved }: { open?: boolean; clientId: string; onsaved: () => void } = $props();

  type Person = { id: string; username: string; name: string };
  let people = $state<Person[]>([]);
  let suggestions = $state<string[]>([]);
  let name = $state("");
  let how = $state<"daily" | "weekly" | "days">("daily");
  let times = $state(3);
  let weekdays = $state<string[]>(["1", "3", "5"]);
  let to = $state<string[]>([]);
  let busy = $state(false);
  let error = $state<string | null>(null);
  const DAYS = [["1", "M"], ["2", "T"], ["3", "W"], ["4", "T"], ["5", "F"], ["6", "S"], ["0", "S"]] as const;
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  $effect(() => {
    if (!open) return;
    name = ""; how = "daily"; times = 3; weekdays = ["1", "3", "5"]; to = [clientId]; error = null;
    void coachApi.getRoster().then((r) => {
      people = r.filter((x) => practice.shows(x.client.isSample)).map((x) => ({ id: x.client.id, username: x.client.username, name: x.client.displayName || x.client.username }));
    }).catch(() => {});
    void getWebCoachHabitRepo().listMine().then((hs) => {
      suggestions = [...new Set(hs.filter((h) => !h.habit.archived).map((h) => h.habit.name))].slice(0, 8);
    }).catch(() => {});
  });

  const cadence = $derived<HabitCadence>(
    how === "weekly" ? { kind: "weekly", timesPerWeek: Math.min(6, Math.max(1, Math.round(times) || 1)) }
    : how === "days" ? { kind: "days", days: weekdays.map(Number).sort((a, b) => a - b) }
    : { kind: "daily" },
  );

  async function save() {
    if (!name.trim()) return void (error = "Name the habit.");
    if (how === "days" && !weekdays.length) return void (error = "Pick at least one day.");
    if (!to.length) return void (error = "Pick who gets it.");
    busy = true;
    error = null;
    try {
      const repo = getWebCoachHabitRepo();
      for (const id of to) {
        const p = people.find((x) => x.id === id);
        if (p) await repo.saveHabit(updateCoachHabit(createCoachHabit(name), { cadence }), p.username);
      }
      toast.success(to.length > 1 ? `Given to ${to.length} clients` : "Habit added");
      open = false;
      onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't add it";
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Add a habit</Dialog.Title>
      <Dialog.Description>They tick it off in their app under "From your coach".</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="habit-name">Habit</Label>
        <Input id="habit-name" bind:value={name} placeholder="8,000 steps" maxlength={80} />
        {#if suggestions.length}
          <span class="flex flex-wrap gap-1.5">
            {#each suggestions as s (s)}<Button variant="outline" size="sm" class="h-7 rounded-full text-xs" onclick={() => (name = s)}>{s}</Button>{/each}
          </span>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>How often</Label>
        <ToggleGroup.Root type="single" variant="outline" spacing={2} class="flex-wrap justify-start" bind:value={() => how, (v: string) => { if (v) how = v as typeof how; }} aria-label="How often">
          <ToggleGroup.Item value="daily" class="h-8 rounded-full px-3 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">Every day</ToggleGroup.Item>
          <ToggleGroup.Item value="weekly" class="h-8 rounded-full px-3 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">Times a week</ToggleGroup.Item>
          <ToggleGroup.Item value="days" class="h-8 rounded-full px-3 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">On some days</ToggleGroup.Item>
        </ToggleGroup.Root>
        {#if how === "weekly"}
          <span class="flex items-center gap-2 text-[13px]"><Input type="number" min={1} max={6} bind:value={times} class="h-8 w-16" aria-label="Times a week" /> times a week, any days</span>
        {:else if how === "days"}
          <ToggleGroup.Root type="multiple" variant="outline" spacing={1} class="justify-start" bind:value={weekdays} aria-label="Which days">
            {#each DAYS as [v, l] (v)}<ToggleGroup.Item value={v} aria-label={DAY_NAMES[Number(v)]} class="size-8 rounded-full text-xs data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">{l}</ToggleGroup.Item>{/each}
          </ToggleGroup.Root>
        {/if}
      </div>
      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-sm font-medium">Give it to</legend>
        <div class="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {#each people as p (p.id)}
            <label class="flex items-center gap-2 text-[13px]"><Checkbox checked={to.includes(p.id)} onCheckedChange={(v) => (to = v ? [...to, p.id] : to.filter((x) => x !== p.id))} /> {p.name}</label>
          {/each}
        </div>
      </fieldset>
      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy} onclick={() => void save()}>{to.length > 1 ? `Give to ${to.length} clients` : "Add habit"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
