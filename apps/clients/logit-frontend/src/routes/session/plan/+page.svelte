<script lang="ts">
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { profile } from "$lib/stores/profile.store";
  import { getSplit } from "$lib/usecases/Splits/getSplit";
  import { planSplitDay } from "$lib/usecases/startSessionFromSplitDay";
  import { advanceRotation } from "$lib/usecases/Splits/splitRotation";
  import { clearDayOverride } from "$lib/stores/todaysPlan.store";
  import { formatPrescription, changeTagClass } from "$lib/features/session/planFormat";
  import type { SessionPlan } from "@logit/core/usecases/progression/planSession";
  import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
  import type { CardioBlockData, StrengthBlockData } from "@logit/core/domain/workout";

  // "Today's plan": shown before a split day starts. Nothing is saved (and the
  // split rotation doesn't move) until Start is pressed.
  const splitId = $derived(page.url.searchParams.get("split"));
  const dayId = $derived(page.url.searchParams.get("day"));
  // Set by the home widget, which records the rotation (by the scheduled day in
  // "original" mode). Starting from the split page never touched the rotation.
  const recordDayId = $derived(page.url.searchParams.get("record"));

  // From "Replace your current workout?": the running draft is discarded on Start.
  const replacing = $derived(page.url.searchParams.get("replace") === "1");

  let day = $state<SplitDay | null>(null);
  let plan = $state<SessionPlan | null>(null);
  let error = $state<string | null>(null);
  let starting = $state(false);

  type Row =
    | { kind: "strength"; id: string; name: string; prescription: string | null; tag?: { text: string; cls: string }; detail?: string; last?: string }
    | { kind: "cardio"; id: string; name: string };

  function fatigueNote(pct: number | undefined): string | undefined {
    const p = Math.round(pct ?? 0);
    return p > 0 ? `${p}% lighter: earlier exercises work the same muscles.` : undefined;
  }

  const rows = $derived.by((): Row[] => {
    if (!plan) return [];
    const unit = $profile.weightUnit;
    return [...plan.session.blocks]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .flatMap((b): Row[] => {
        if (b.type === "strength") {
          const d = b.data as StrengthBlockData;
          const s = plan!.suggestions[b.id];
          return [{
            kind: "strength",
            id: b.id,
            name: d.exerciseName,
            prescription: s ? formatPrescription(s.sets, unit, !!s.bodyweightLoad) : null,
            tag: s?.change ? { text: s.change.text, cls: changeTagClass(s.change.kind) } : undefined,
            detail: [s?.change?.detail, fatigueNote(s?.reasoning?.computed?.fatigueDiscountPct)].filter(Boolean).join(" "),
          }];
        }
        if (b.type === "cardio") return [{ kind: "cardio", id: b.id, name: (b.data as CardioBlockData).activityName }];
        return [];
      });
  });

  const workingSetCount = $derived(
    plan
      ? plan.session.blocks
          .filter((b) => b.type === "strength")
          .reduce((n, b) => n + (b.data as StrengthBlockData).sets.filter((s) => s.setType === "normal").length, 0)
      : 0,
  );

  onMount(async () => {
    if ($currentSession && !replacing) {
      // A workout is already running — that's where this should go.
      await goto("/session/current", { replaceState: true });
      return;
    }
    try {
      if (!splitId || !dayId) throw new Error("No split day picked.");
      const split = await getSplit(splitId);
      day = split?.days.find((d) => d.id === dayId) ?? null;
      if (!day) throw new Error("That split day no longer exists.");
      plan = await planSplitDay(day);
      // No progression algorithm picked: nothing to preview, just start.
      if (Object.keys(plan.suggestions).length === 0) await start();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't plan this workout";
    }
  });

  async function start() {
    if (!plan || starting) return;
    starting = true;
    try {
      if (splitId && recordDayId) {
        advanceRotation(splitId, recordDayId);
        clearDayOverride();
      }
      const previous = replacing ? $currentSession : null;
      if (previous) {
        const repo = getWorkoutRepo();
        await repo.clearDraftSession();
        await repo.deleteSession(previous.id);
      }
      await currentSession.startPlanned(plan.session);
      await goto("/session/current", { replaceState: true });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't start the workout";
      starting = false;
    }
  }
</script>

<div class="flex min-h-dvh flex-col">
  <div class="page-header">
    <BackButton onclick={() => back("/")} />
    <h1 class="page-title">Today's plan</h1>
  </div>

  {#if error}
    <p class="border-b border-border px-3 py-2 text-sm text-destructive">{error}</p>
  {/if}

  {#if day}
    <div class="border-b border-border px-3 pb-3 pt-4">
      <h2 class="text-xl font-bold">{day.name ?? "Workout"}</h2>
      {#if plan}
        <p class="mt-0.5 text-xs text-muted-foreground">
          {rows.length} exercise{rows.length === 1 ? "" : "s"} · {workingSetCount} working set{workingSetCount === 1 ? "" : "s"}
        </p>
      {/if}
    </div>
  {/if}

  <div class="flex-1 pb-32">
    {#if !plan && !error}
      <p class="px-3 py-6 text-sm text-muted-foreground">Working out today's numbers…</p>
    {/if}
    {#each rows as row (row.id)}
      <div class="flex flex-col gap-0.5 border-b border-border px-3 py-3" data-testid="plan-row">
        <div class="flex items-center gap-2">
          <span class="flex-1 text-sm">{row.name}</span>
          {#if row.kind === "strength" && row.tag}
            <span class="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold {row.tag.cls}">{row.tag.text}</span>
          {/if}
        </div>
        {#if row.kind === "strength"}
          {#if row.prescription}
            <p class="text-[15px] font-semibold tabular-nums">{row.prescription}</p>
          {:else}
            <p class="text-sm text-muted-foreground">No plan yet. Log it and the next one will have one.</p>
          {/if}
          {#if row.detail}
            <p class="text-xs text-muted-foreground">{row.detail}</p>
          {/if}
        {:else}
          <p class="text-sm text-muted-foreground">Cardio</p>
        {/if}
      </div>
    {/each}
  </div>

  <div class="fixed bottom-0 left-0 right-0 border-t border-border bg-background px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
    <Button class="h-12 w-full text-[15px]" disabled={!plan || starting} onclick={start}>
      {starting ? "Starting…" : "Start workout"}
    </Button>
  </div>
</div>
