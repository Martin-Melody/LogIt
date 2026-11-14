<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { Goal, GoalTarget } from "@logit/core/domain/goals";
  import { goalViewFromSeries, type GoalView } from "@logit/core/domain/goalView";
  import { deadlineText, goalFormat, goalStatusText } from "@logit/core/domain/goalText";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { fromDisplayWeight, toDisplayWeight, trimWeight, type WeightUnit } from "@logit/core/domain/units";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import type { ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { addGoal, goalSeries, updateGoal } from "./goalsData";
  import GoalChart from "./GoalChart.svelte";

  /**
   * New goal, or change one. The four kinds the app has; bodyweight lives on the nutrition
   * goal, so it's a link. Underneath, a live "how far off is it?" from your own logs.
   */
  let {
    open = $bindable(false),
    goal = null,
    index,
    sessions,
    unit,
    onSaved,
  }: {
    open?: boolean;
    goal?: Goal | null;
    index: ExerciseIndex;
    sessions: WorkoutSession[];
    unit: WeightUnit;
    onSaved: () => void;
  } = $props();

  type Kind = "lift" | "reps" | "sessions" | "volume";
  const KINDS: { id: Kind; label: string; example: string }[] = [
    { id: "lift", label: "Lift a weight", example: "Bench 120 kg × 5" },
    { id: "reps", label: "Reps in one set", example: "20 pull-ups" },
    { id: "sessions", label: "Number of workouts", example: "200 this year" },
    { id: "volume", label: "Total lifted", example: "1,000 t since January" },
  ];

  const year = localDateIso().slice(0, 4);
  let kind = $state<Kind>("lift");
  let exercise = $state("");
  let weight = $state("");
  let reps = $state("1");
  let countTarget = $state("");
  let startIso = $state(`${year}-01-01`);
  let hasDeadline = $state(false);
  let deadlineIso = $state(`${year}-12-31`);
  let saving = $state(false);
  let error = $state<string | null>(null);

  // Fill the form each time it opens.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      const t = goal?.target;
      kind = !t ? "lift" : t.type === "count" ? t.metric : t.type;
      exercise = t && t.type !== "count" ? t.exerciseName : "";
      weight = t?.type === "lift" ? trimWeight(Math.round(toDisplayWeight(t.weightKg, unit) * 4) / 4) : "";
      reps = t?.type === "lift" || t?.type === "reps" ? String(t.reps) : t ? "" : "1";
      countTarget = t?.type === "count" ? String(t.metric === "volume" ? Math.round(toDisplayWeight(t.target, unit)) : t.target) : "";
      startIso = t?.type === "count" ? t.startIso : `${year}-01-01`;
      hasDeadline = !!goal?.deadlineIso;
      deadlineIso = goal?.deadlineIso ?? `${year}-12-31`;
      error = null;
    }
    wasOpen = open;
  });

  function pickKind(k: Kind) {
    if (k === kind) return;
    if (k === "reps" && reps === "1") reps = "";
    if (k === "lift" && reps === "") reps = "1";
    if ((k === "sessions" || k === "volume") && !goal) hasDeadline = true;
    kind = k;
  }

  const target = $derived.by<GoalTarget | null>(() => {
    const n = (v: string) => Number(v.replace(",", "."));
    if (kind === "sessions" || kind === "volume") {
      const c = n(countTarget);
      if (!(c > 0) || !startIso) return null;
      return { type: "count", metric: kind, target: kind === "volume" ? fromDisplayWeight(c, unit) : Math.round(c), startIso };
    }
    const name = exercise.trim();
    if (!name) return null;
    const info = index.get(name);
    const base = { exerciseName: info?.name ?? name, ...(info?.id ? { exerciseId: info.id } : {}) };
    const r = Math.round(n(reps));
    if (!(r >= 1)) return null;
    if (kind === "reps") return { type: "reps", ...base, reps: r };
    const w = n(weight);
    if (!(w > 0)) return null;
    return { type: "lift", ...base, weightKg: Math.round(fromDisplayWeight(w, unit) * 1000) / 1000, reps: r };
  });
  const valid = $derived(target != null && (!hasDeadline || !!deadlineIso));

  // The preview: same projection the goal card will show, from your logs.
  let preview = $state<GoalView | null>(null);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const t = target;
    const dl = hasDeadline ? deadlineIso : null;
    clearTimeout(previewTimer);
    if (!t || !open) {
      preview = null;
      return;
    }
    previewTimer = setTimeout(() => {
      const now = Date.now();
      const draft: Goal = { id: goal?.id ?? "preview", target: t, deadlineIso: dl, createdAtMs: goal?.createdAtMs ?? now, updatedAtMs: now };
      void goalSeries(draft, sessions).then((series) => {
        if (target === t) preview = goalViewFromSeries(draft, series, Date.now(), "");
      }).catch(() => (preview = null));
    }, 250);
  });

  const fmt = $derived(preview ? goalFormat(preview, unit) : null);
  const nowText = $derived.by(() => {
    if (!preview || !fmt) return null;
    const cur = preview.projection.current ?? preview.points.at(-1)?.value;
    if (preview.points.length === 0) return target?.type === "count" ? "Nothing logged since then yet." : "No sessions with this exercise yet.";
    return cur == null ? null : `Now about ${fmt.fmt(cur)}.`;
  });

  const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);

  async function save() {
    if (!target || saving) return;
    saving = true;
    error = null;
    try {
      const dl = hasDeadline ? deadlineIso : null;
      if (goal) await updateGoal(goal, { target, deadlineIso: dl });
      else await addGoal(target, dl);
      open = false;
      onSaved();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save the goal.";
    } finally {
      saving = false;
    }
  }

  const field = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring";
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-[560px]">
    <Dialog.Header>
      <Dialog.Title>{goal ? "Change goal" : "New goal"}</Dialog.Title>
      <Dialog.Description class="sr-only">Pick what kind of goal, then the target.</Dialog.Description>
    </Dialog.Header>

    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <fieldset class="flex flex-col gap-2">
        <legend class="pb-2 text-xs text-muted-foreground">What kind?</legend>
        <div class="grid grid-cols-2 gap-2">
          {#each KINDS as k (k.id)}
            <button type="button" aria-pressed={kind === k.id} onclick={() => pickKind(k.id)}
              class="flex flex-col gap-0.5 rounded-[10px] border p-3 text-left {kind === k.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}">
              <span class="text-[13px] font-semibold">{k.label}</span>
              <span class="text-xs text-muted-foreground">{k.example}</span>
            </button>
          {/each}
        </div>
        <span class="text-xs text-muted-foreground">Body weight goals live on your <a href="/nutrition/goal" class="text-primary hover:underline">Nutrition goal</a>.</span>
      </fieldset>

      {#if kind === "lift" || kind === "reps"}
        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-muted-foreground" id="goal-ex-label">Exercise</span>
          {#if exercise}
            <div class="flex items-center justify-between gap-2 rounded-lg border border-input px-3 py-2 text-sm" aria-labelledby="goal-ex-label">
              <span class="font-medium">{exercise}</span>
              <button type="button" class="text-xs text-primary hover:underline" onclick={() => (exercise = "")}>Change</button>
            </div>
          {:else}
            <NamePicker id="goal-exercise" label="Exercise" placeholder="Search exercises…" autofocus
              search={(q) => index.search(q).map((e) => ({ name: e.name, detail: e.last ? "" : "never done" }))}
              onPick={(n) => (exercise = n)} />
          {/if}
        </div>
        <div class="grid grid-cols-2 gap-3">
          {#if kind === "lift"}
            <div class="flex flex-col gap-1.5"><label for="goal-weight" class="text-xs text-muted-foreground">Weight ({unit})</label><input id="goal-weight" inputmode="decimal" bind:value={weight} class={field} /></div>
          {/if}
          <div class="flex flex-col gap-1.5"><label for="goal-reps" class="text-xs text-muted-foreground">Reps{kind === "reps" ? " in one set" : ""}</label><input id="goal-reps" inputmode="numeric" bind:value={reps} class={field} /></div>
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="goal-count" class="text-xs text-muted-foreground">{kind === "sessions" ? "Workouts" : `Total (${unit})`}</label>
            <input id="goal-count" inputmode="numeric" bind:value={countTarget} class={field} />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="goal-start" class="text-xs text-muted-foreground">Counting from</label>
            <input id="goal-start" type="date" bind:value={startIso} class={field} />
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap items-end gap-3">
        <label class="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" bind:checked={hasDeadline} /> By a date</label>
        {#if hasDeadline}
          <div class="flex flex-col gap-1.5">
            <label for="goal-by" class="sr-only">By</label>
            <input id="goal-by" type="date" bind:value={deadlineIso} class="{field} w-44" />
          </div>
        {/if}
      </div>

      {#if preview && fmt}
        <div class="flex flex-col gap-2 rounded-[10px] border border-border bg-muted/40 px-3.5 py-3">
          <span class="text-[13px] font-semibold">How far off is it?</span>
          {#if preview.points.length > 0}
            <GoalChart view={preview} toDisplay={fmt.toDisplay} unitLabel={fmt.unitLabel} width={500} height={150} />
          {/if}
          <p class="text-xs leading-relaxed text-muted-foreground">
            {#if nowText}{nowText} {/if}{sentence(goalStatusText(preview, unit))}
            {#if deadlineText(preview, unit)}{sentence(deadlineText(preview, unit)!)}{/if}
          </p>
        </div>
      {/if}

      {#if error}<p class="text-[13px] text-destructive">{error}</p>{/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={!valid || saving}>{saving ? "Saving…" : goal ? "Save" : "Add goal"}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
