<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import type { ReasoningConfidence } from "@logit/core/domain/reasoning";
  import { formatLoad, type WeightUnit } from "@logit/core/domain/units";
  import { tagClass } from "$lib/components/ui/choice";

  // "Why this weight?" (design canvas S-why): the three numbers it comes from, then the
  // reasoning in plain steps. The raw inputs stay one tap away.
  const {
    open,
    onOpenChange,
    exerciseName,
    suggestion,
    lastTime = "",
    weightUnit = "kg",
    bodyweight = false,
    onSettings,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    exerciseName: string;
    suggestion: ProgressionOutput;
    /** "Last time 90.5 kg × 8, 8, 6". */
    lastTime?: string;
    weightUnit?: WeightUnit;
    bodyweight?: boolean;
    /** "Change how it plans": the exercise's progression settings. */
    onSettings?: () => void;
  } = $props();

  let showNumbers = $state(false);

  const reasoning = $derived(suggestion.reasoning!);
  const first = $derived(suggestion.sets[0]);
  const title = $derived.by(() => {
    const w = first?.weight;
    const r = Array.isArray(first?.reps) ? first.reps[0] : first?.reps;
    if (w && r) return `Why ${formatLoad(w, weightUnit, bodyweight)} × ${r}?`;
    return reasoning.verdict.length <= 24 ? `Why ${reasoning.verdict}?` : "Why this plan?";
  });

  const CONFIDENCE: Record<ReasoningConfidence, { label: string; tone: "warn" | "plan" | "done" }> = {
    low: { label: "Not much data yet, so take this lightly", tone: "warn" },
    medium: { label: "Fairly sure", tone: "plan" },
    high: { label: "Based on plenty of workouts", tone: "done" },
  };

  const estimate = $derived(typeof reasoning.computed.strengthEstimateKg === "number" ? (reasoning.computed.strengthEstimateKg as number) : null);
  const lastTop = $derived(lastTime.replace(/^Last time\s*/i, "").split(" × ")[0] || null);
  const goal = $derived(suggestion.progressGoal ?? null);
  const tiles = $derived(
    [
      estimate ? { value: formatLoad(estimate, weightUnit, false), label: "Strength estimate" } : null,
      lastTop ? { value: lastTop, label: "Last time" } : null,
      goal
        ? goal.weight !== undefined
          ? { value: formatLoad(goal.weight, weightUnit, bodyweight), label: `Next, at ${goal.reps} on every set` }
          : { value: `${goal.reps} reps`, label: "A set goes up at" }
        : suggestion.change
          ? { value: suggestion.change.text, label: "Today" }
          : null,
    ].filter((t): t is { value: string; label: string } => !!t),
  );
  const steps = $derived(reasoning.summary?.filter(Boolean) ?? []);
  const fatigue = $derived(Math.round((reasoning.computed.fatigueDiscountPct as number | undefined) ?? 0));

  function formatKey(key: string): string {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  function formatValue(value: unknown): string {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(Math.round(value * 100) / 100);
    return String(value);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="gap-3.5 bg-card">
    <div class="flex flex-col gap-0.5 pr-8">
      <Dialog.Title class="text-[19px] font-semibold">{title}</Dialog.Title>
      <Dialog.Description class="text-[13px]">{exerciseName}{reasoning.verdict.length > 24 ? ` · ${reasoning.verdict}` : ""}</Dialog.Description>
    </div>
    <span class={tagClass(CONFIDENCE[reasoning.confidence].tone, "w-fit h-6 px-2 text-xs font-medium")}>{CONFIDENCE[reasoning.confidence].label}</span>

    {#if tiles.length}
      <div class="grid gap-2" style="grid-template-columns: repeat({tiles.length}, minmax(0, 1fr))">
        {#each tiles as t (t.label)}
          <div class="flex flex-col gap-0.5 rounded-xl bg-muted px-3 py-2.5">
            <b class="text-lg font-semibold tabular-nums">{t.value}</b>
            <span class="text-[11px] leading-tight text-muted-foreground">{t.label}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if steps.length || fatigue > 0}
      <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm leading-snug">
        {#each steps as line (line)}<li>{line}</li>{/each}
        {#if fatigue > 0}<li>{fatigue}% lighter today: earlier exercises already worked these muscles.</li>{/if}
      </ol>
    {/if}

    {#if showNumbers}
      <div class="flex flex-col gap-3 rounded-xl bg-muted/60 p-3 text-xs">
        {#each [["Looked at", reasoning.inputs], ["Worked out", reasoning.computed]] as [heading, values] (heading)}
          {#if Object.keys(values as object).length}
            <div>
              <p class="mb-1 font-medium text-muted-foreground">{heading}</p>
              <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                {#each Object.entries(values as object) as [key, value] (key)}
                  <dt class="text-muted-foreground">{formatKey(key)}</dt>
                  <dd class="text-right tabular-nums">{formatValue(value)}</dd>
                {/each}
              </dl>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <div class="flex gap-2">
      <button type="button" class="h-11 flex-1 rounded-xl border border-input text-sm font-medium" onclick={() => (showNumbers = !showNumbers)}>
        {showNumbers ? "Hide the numbers" : "Show the numbers"}
      </button>
      {#if onSettings}
        <button type="button" class="h-11 flex-1 rounded-xl border border-input text-sm font-medium" onclick={() => { onOpenChange(false); onSettings(); }}>
          Change how it plans
        </button>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
