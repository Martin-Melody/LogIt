<script lang="ts">
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import {
    createHabit,
    type Habit,
    type HabitCadence,
    type HabitTone,
  } from "@logit/core/domain/habit";

  /**
   * Create / edit form for a personal habit.
   *
   * - **Create** shows a single "Create habit" button; the parent persists on `onsave`.
   * - **Edit** has no buttons — every valid change is committed straight away via
   *   `onsave` (matches the exercise editor). The parent's `onsave` should just
   *   persist and stay on the page.
   */
  const {
    habit,
    onsave,
  }: {
    habit?: Habit;
    onsave: (h: Habit) => void;
  } = $props();

  type Mode = "daily" | "days" | "weekly";

  const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const TONES: { value: HabitTone; class: string }[] = [
    { value: "primary", class: "bg-primary" },
    { value: "green", class: "bg-emerald-500" },
    { value: "amber", class: "bg-amber-500" },
    { value: "rose", class: "bg-rose-500" },
  ];

  // The form seeds from the habit once; edits after that are the form's own state.
  const seed = untrack(() => habit);
  const isEdit = !!seed;

  let name = $state(seed?.name ?? "");
  let icon = $state(seed?.icon ?? "");
  let tone = $state<HabitTone | undefined>(seed?.tone);

  let mode = $state<Mode>(seed?.cadence.kind ?? "daily");
  let days = $state<number[]>(
    seed?.cadence.kind === "days" ? [...seed.cadence.days] : [1, 2, 3, 4, 5],
  );
  let timesPerWeek = $state(
    seed?.cadence.kind === "weekly" ? String(seed.cadence.timesPerWeek) : "3",
  );

  let tracksNumber = $state(!!seed?.target);
  let targetValue = $state(seed?.target ? String(seed.target.value) : "");
  let targetUnit = $state(seed?.target?.unit ?? "");

  const MODE_LABELS: Record<Mode, string> = {
    daily: "Every day",
    days: "Specific days",
    weekly: "Times per week",
  };

  function toggleDay(d: number): void {
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
  }

  const canSave = $derived(
    name.trim().length > 0 &&
      (mode !== "days" || days.length > 0) &&
      (mode !== "weekly" || Number(timesPerWeek) >= 1) &&
      (!tracksNumber || Number(targetValue) > 0),
  );

  function buildCadence(): HabitCadence {
    if (mode === "days") return { kind: "days", days: [...days].sort((a, b) => a - b) };
    if (mode === "weekly")
      return { kind: "weekly", timesPerWeek: Math.max(1, Math.round(Number(timesPerWeek) || 1)) };
    return { kind: "daily" };
  }

  function buildHabit(): Habit {
    const base = seed ?? createHabit(name);
    return {
      ...base,
      name: name.trim(),
      icon: icon.trim() || undefined,
      tone,
      cadence: buildCadence(),
      target: tracksNumber
        ? { value: Number(targetValue), unit: targetUnit.trim() || undefined }
        : undefined,
      updatedAtMs: Date.now(),
    };
  }

  /** Everything that defines a habit except its mutation timestamp. */
  function fingerprint(h: Habit): string {
    const { updatedAtMs: _drop, ...rest } = h;
    return JSON.stringify(rest);
  }

  function create(): void {
    if (canSave) onsave(buildHabit());
  }

  // Edit mode: auto-commit any valid change. `savedFp` guards against the
  // initial run and no-op re-saves.
  let savedFp = seed ? fingerprint(seed) : "";
  $effect(() => {
    if (!isEdit || !canSave) return;
    const next = buildHabit();
    const fp = fingerprint(next);
    if (fp === savedFp) return;
    savedFp = fp;
    onsave(next);
  });
</script>

<div class="flex flex-col gap-5 px-3 py-4">
  <label class="flex flex-col gap-1">
    <span class="text-[11px] text-muted-foreground">Name</span>
    <input
      class="bg-muted rounded px-2 py-1.5 text-sm outline-none"
      placeholder="Drink water, Stretch, Read…"
      bind:value={name}
    />
  </label>

  <div class="flex gap-3">
    <label class="flex w-16 flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Icon</span>
      <input
        class="bg-muted rounded px-2 py-1.5 text-center text-sm outline-none"
        maxlength="2"
        placeholder="💧"
        bind:value={icon}
      />
    </label>
    <div class="flex flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Colour</span>
      <div class="flex items-center gap-1.5 py-1.5">
        {#each TONES as t (t.value)}
          <button
            type="button"
            aria-label={t.value}
            class="h-5 w-5 rounded-full {t.class} {tone === t.value
              ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
              : 'opacity-60'}"
            onclick={() => (tone = tone === t.value ? undefined : t.value)}
          ></button>
        {/each}
      </div>
    </div>
  </div>

  <div class="flex flex-col gap-1">
    <span class="text-[11px] text-muted-foreground">Cadence</span>
    <Select.Root type="single" bind:value={mode}>
      <Select.Trigger class="w-full">{MODE_LABELS[mode]}</Select.Trigger>
      <Select.Content>
        <Select.Item value="daily" label="Every day" />
        <Select.Item value="days" label="Specific days" />
        <Select.Item value="weekly" label="Times per week" />
      </Select.Content>
    </Select.Root>

    {#if mode === "days"}
      <div class="flex gap-1 pt-2">
        {#each WEEKDAYS as label, d (d)}
          <button
            type="button"
            class="h-8 flex-1 rounded text-xs font-medium {days.includes(d)
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'}"
            onclick={() => toggleDay(d)}
          >
            {label}
          </button>
        {/each}
      </div>
    {:else if mode === "weekly"}
      <label class="flex items-center gap-2 pt-2">
        <input
          class="bg-muted w-16 rounded px-2 py-1.5 text-sm outline-none"
          inputmode="numeric"
          bind:value={timesPerWeek}
        />
        <span class="text-xs text-muted-foreground">times per week, any days</span>
      </label>
    {/if}
  </div>

  <div class="flex flex-col gap-1">
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={tracksNumber} />
      <span class="text-sm">Track a number</span>
    </label>
    {#if tracksNumber}
      <div class="flex items-center gap-2 pt-1">
        <input
          class="bg-muted w-20 rounded px-2 py-1.5 text-sm outline-none"
          inputmode="decimal"
          placeholder="8"
          bind:value={targetValue}
        />
        <input
          class="bg-muted w-24 rounded px-2 py-1.5 text-sm outline-none"
          placeholder="glasses"
          bind:value={targetUnit}
        />
        <span class="text-xs text-muted-foreground">target per day</span>
      </div>
    {/if}
  </div>

  {#if !isEdit}
    <Button class="w-full" disabled={!canSave} onclick={create}>Create habit</Button>
  {/if}
</div>
