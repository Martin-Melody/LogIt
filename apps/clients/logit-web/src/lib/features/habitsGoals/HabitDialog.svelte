<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { createHabit, type Habit, type HabitCadence, type HabitTone } from "@logit/core/domain/habit";
  import { saveHabit } from "./habitsData";

  /** New habit, or change one: name, how often, tick or a number, colour, archive. */
  let {
    open = $bindable(false),
    habit = null,
    onSaved,
  }: {
    open?: boolean;
    habit?: Habit | null;
    onSaved: () => void;
  } = $props();

  type Often = "daily" | "days" | "weekly";
  let name = $state("");
  let often = $state<Often>("daily");
  let days = $state<number[]>([1, 3, 5]);
  let timesPerWeek = $state("3");
  let numeric = $state(false);
  let targetValue = $state("");
  let targetUnit = $state("");
  let tone = $state<HabitTone>("primary");
  let saving = $state(false);
  let error = $state<string | null>(null);

  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      const c = habit?.cadence;
      name = habit?.name ?? "";
      often = c?.kind ?? "daily";
      days = c?.kind === "days" ? [...c.days] : [1, 3, 5];
      timesPerWeek = c?.kind === "weekly" ? String(c.timesPerWeek) : "3";
      numeric = !!habit?.target;
      targetValue = habit?.target ? String(habit.target.value) : "";
      targetUnit = habit?.target?.unit ?? "";
      tone = habit?.tone ?? "primary";
      error = null;
    }
    wasOpen = open;
  });

  const WEEKDAYS = [
    { n: 1, short: "M", label: "Monday" }, { n: 2, short: "T", label: "Tuesday" }, { n: 3, short: "W", label: "Wednesday" },
    { n: 4, short: "T", label: "Thursday" }, { n: 5, short: "F", label: "Friday" }, { n: 6, short: "S", label: "Saturday" },
    { n: 0, short: "S", label: "Sunday" },
  ];
  const TONES: { id: HabitTone; label: string; cls: string }[] = [
    { id: "primary", label: "Blue", cls: "bg-primary" },
    { id: "green", label: "Green", cls: "bg-success" },
    { id: "amber", label: "Amber", cls: "bg-warning" },
    { id: "rose", label: "Rose", cls: "bg-rose-500" },
  ];

  const cadence = $derived.by<HabitCadence | null>(() => {
    if (often === "daily") return { kind: "daily" };
    if (often === "days") return days.length ? { kind: "days", days: [...days].sort() } : null;
    const n = Math.round(Number(timesPerWeek));
    return n >= 1 && n <= 7 ? { kind: "weekly", timesPerWeek: n } : null;
  });
  const target = $derived.by(() => {
    if (!numeric) return undefined;
    const v = Number(targetValue.replace(",", "."));
    return v > 0 ? { value: v, ...(targetUnit.trim() ? { unit: targetUnit.trim() } : {}) } : null;
  });
  const valid = $derived(name.trim().length > 0 && cadence != null && target !== null);

  async function save(archived?: boolean) {
    if (saving || (!valid && archived === undefined)) return;
    saving = true;
    error = null;
    try {
      const base = habit ?? createHabit(name);
      const next: Habit = {
        ...base,
        name: name.trim() || base.name,
        cadence: cadence ?? base.cadence,
        tone,
        archived: archived ?? base.archived,
      };
      if (target) next.target = target;
      else if (target === undefined) delete next.target;
      await saveHabit(next);
      open = false;
      onSaved();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save the habit.";
    } finally {
      saving = false;
    }
  }

  const field = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring";
  const seg = "h-8 flex-1 rounded-[7px] text-[13px]";
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-[500px]">
    <Dialog.Header>
      <Dialog.Title>{habit ? "Edit habit" : "New habit"}</Dialog.Title>
      <Dialog.Description class="sr-only">Name, how often, and whether you tick it or log a number.</Dialog.Description>
    </Dialog.Header>

    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <div class="flex flex-col gap-1.5">
        <label for="habit-name" class="text-xs text-muted-foreground">Name</label>
        <input id="habit-name" bind:value={name} placeholder="Creatine, 10k steps, stretch…" class={field} />
      </div>

      <div class="flex flex-col gap-2">
        <span id="habit-often" class="text-xs text-muted-foreground">How often</span>
        <div role="radiogroup" aria-labelledby="habit-often" class="flex gap-[3px] rounded-[9px] bg-muted p-[3px]">
          {#each [["daily", "Every day"], ["days", "Some days"], ["weekly", "Times a week"]] as [id, label] (id)}
            <button type="button" role="radio" aria-checked={often === id} onclick={() => (often = id as Often)}
              class="{seg} {often === id ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}">{label}</button>
          {/each}
        </div>
        {#if often === "days"}
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Which days">
            {#each WEEKDAYS as d (d.n)}
              <button type="button" aria-pressed={days.includes(d.n)} aria-label={d.label}
                onclick={() => (days = days.includes(d.n) ? days.filter((x) => x !== d.n) : [...days, d.n])}
                class="size-9 rounded-full border text-xs {days.includes(d.n) ? 'border-transparent bg-primary font-semibold text-primary-foreground' : 'border-border text-muted-foreground'}">{d.short}</button>
            {/each}
          </div>
        {:else if often === "weekly"}
          <div class="flex items-center gap-2.5 text-[13px]">
            <label for="habit-times" class="text-muted-foreground">Times a week</label>
            <input id="habit-times" inputmode="numeric" bind:value={timesPerWeek} class="{field} w-20 text-right" />
          </div>
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <span id="habit-kind" class="text-xs text-muted-foreground">Tick or number?</span>
        <div role="radiogroup" aria-labelledby="habit-kind" class="flex gap-[3px] rounded-[9px] bg-muted p-[3px]">
          <button type="button" role="radio" aria-checked={!numeric} onclick={() => (numeric = false)} class="{seg} {!numeric ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}">Just tick it</button>
          <button type="button" role="radio" aria-checked={numeric} onclick={() => (numeric = true)} class="{seg} {numeric ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}">Log a number</button>
        </div>
        {#if numeric}
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5"><label for="habit-target" class="text-xs text-muted-foreground">Target</label><input id="habit-target" inputmode="decimal" bind:value={targetValue} class={field} /></div>
            <div class="flex flex-col gap-1.5"><label for="habit-unit" class="text-xs text-muted-foreground">Unit</label><input id="habit-unit" bind:value={targetUnit} placeholder="steps, L, h…" class={field} /></div>
          </div>
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <span id="habit-tone" class="text-xs text-muted-foreground">Colour</span>
        <div role="radiogroup" aria-labelledby="habit-tone" class="flex gap-2.5">
          {#each TONES as t (t.id)}
            <button type="button" role="radio" aria-checked={tone === t.id} aria-label={t.label} onclick={() => (tone = t.id)}
              class="size-8 rounded-full {t.cls} {tone === t.id ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}"></button>
          {/each}
        </div>
      </div>

      {#if error}<p class="text-[13px] text-destructive">{error}</p>{/if}

      <Dialog.Footer class="flex-wrap sm:justify-between">
        {#if habit}
          <Button type="button" variant="outline" disabled={saving} onclick={() => void save(!habit!.archived)}>{habit.archived ? "Restore" : "Archive"}</Button>
        {:else}<span></span>{/if}
        <span class="flex gap-2">
          <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
          <Button type="submit" disabled={!valid || saving}>{saving ? "Saving…" : habit ? "Save" : "Add habit"}</Button>
        </span>
      </Dialog.Footer>
      {#if habit && !habit.archived}
        <p class="text-xs text-muted-foreground">Archiving keeps its history; it stops showing on your phone's habit list.</p>
      {/if}
    </form>
  </Dialog.Content>
</Dialog.Root>
