<script lang="ts">
  import { Check, Info, Minus, TrendingUp, ArrowRight } from "lucide-svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { formatWeight } from "@logit/core/domain/units";
  import type { WorkoutSession, StrengthBlockData, MobilityBlockData, PlannedItem } from "@logit/core/domain/workout";
  import { blockDisplayName, isContinuationSet, mobilitySetGroups } from "@logit/core/domain/workout";
  import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
  import { comparePlan, splitChangesSince, type PlanRow, type PlanRowStatus } from "@logit/core/domain/sessionHistory";
  import { planRowDetail, setsSummary, longDayLabel } from "./format";

  const {
    open,
    session,
    /** The day as it is in the split now; null when it's gone, undefined when unknown. */
    currentDay,
    unit,
    onOpenChange,
    onOpenParent,
    onMatchDay,
  }: {
    open: boolean;
    session: WorkoutSession;
    currentDay: SplitDay | null | undefined;
    unit: WeightUnit;
    onOpenChange: (v: boolean) => void;
    onOpenParent?: () => void;
    onMatchDay?: () => void;
  } = $props();

  const source = $derived(session.source!);
  const cmp = $derived(comparePlan(session));

  // Members of one superset / circuit show as one row.
  type ShownRow = { key: string; name: string; planned: string; done: string; status: PlanRowStatus; detail: string; swappedTo?: string };

  const WORST: PlanRowStatus[] = ["skipped", "swapped", "under", "done", "beat"];

  function plannedText(item: PlannedItem): string {
    if (item.type === "strength") {
      const sets = (item.sets ?? []).filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType));
      if (!sets.length) return "–";
      const r = sets[0]!;
      const reps = sets.every((s) => s.reps === r.reps && s.repsMax === r.repsMax)
        ? `${sets.length} × ${r.repsMax ? `${r.reps}–${r.repsMax}` : r.reps}`
        : sets.map((s) => s.reps).join(", ");
      const w = Math.max(...sets.map((s) => s.weight));
      return w > 0 ? `${reps} · ${formatWeight(w, unit, { withUnit: false })}` : reps;
    }
    if (item.type === "mobility") {
      const each = item.targetSec ? `${item.targetSec} s` : item.targetReps ? `${item.targetReps}` : "";
      return each ? `${item.rounds ?? 1} × ${each}` : `${item.rounds ?? 1} rounds`;
    }
    return "–";
  }

  function doneText(row: PlanRow): string {
    const b = row.block;
    if (!b || row.status === "skipped") return "–";
    if (b.type === "strength") {
      const sets = (b.data as StrengthBlockData).sets.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType) && s.reps > 0);
      return setsSummary(sets, unit).replace(` ${unit}`, "");
    }
    if (b.type === "mobility") {
      const d = b.data as MobilityBlockData;
      const vals = d.sets.map((s) => (d.metric === "hold" ? s.durationSec : s.reps) ?? 0).filter((v) => v > 0);
      const rounds = mobilitySetGroups(d).length;
      return vals.length ? `${rounds} × ${Math.max(...vals)}${d.metric === "hold" ? " s" : ""}` : "–";
    }
    return "done";
  }

  const rows = $derived.by((): ShownRow[] => {
    if (!cmp) return [];
    const out: ShownRow[] = [];
    for (let i = 0; i < cmp.rows.length; i++) {
      const row = cmp.rows[i]!;
      const g = row.item.groupId;
      if (g) {
        const members: PlanRow[] = [];
        while (i < cmp.rows.length && cmp.rows[i]!.item.groupId === g) members.push(cmp.rows[i++]!);
        i--;
        if (members.length > 1) {
          const status = WORST.find((s) => members.some((m) => m.status === s)) ?? "done";
          const rounds = Math.max(...members.map((m) => (m.item.sets ?? []).filter((s) => s.setType !== "warmup").length));
          const doneRounds = Math.max(
            0,
            ...members.map((m) =>
              m.block?.type === "strength" ? (m.block.data as StrengthBlockData).sets.filter((s) => s.setType !== "warmup" && s.reps > 0).length : 0,
            ),
          );
          out.push({
            key: g,
            name: members.map((m) => m.item.name).join(" + "),
            planned: `${rounds} round${rounds === 1 ? "" : "s"}`,
            done: `${doneRounds} round${doneRounds === 1 ? "" : "s"}`,
            status,
            detail: members.map((m) => planRowDetail(m, unit)).filter(Boolean).join("; "),
          });
          continue;
        }
      }
      const metric = row.block?.type === "mobility" ? (row.block.data as MobilityBlockData).metric : null;
      out.push({
        key: row.item.blockId,
        name: row.item.name,
        planned: plannedText(row.item),
        done: doneText(row),
        status: row.status,
        detail: planRowDetail(row, unit, metric),
        ...(row.doneName ? { swappedTo: row.doneName } : {}),
      });
    }
    return out;
  });

  const changes = $derived(currentDay === undefined || !source.plan ? null : splitChangesSince(source.plan, currentDay));
  const changeText = $derived.by(() => {
    if (!changes) return null;
    if (changes.dayGone) return `${source.dayName} is no longer in ${source.parentName}.`;
    const parts = [
      ...changes.swaps.map((s) => `${s.from} is now ${s.to}`),
      ...(changes.added.length ? [`${changes.added.join(", ")} added`] : []),
      ...(changes.removed.length ? [`${changes.removed.join(", ")} taken out`] : []),
    ];
    return parts.length ? `The day has changed since: ${parts.join("; ")}.` : null;
  });
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]">
    <Dialog.Header class="px-5 pt-5 pb-3 pr-12 text-left">
      <Dialog.Title>The plan that day</Dialog.Title>
      <Dialog.Description>
        {source.parentName} › {source.dayNumber ? `Day ${source.dayNumber} · ` : ""}{source.dayName}, as it was on {longDayLabel(session.startedAtMs)}
      </Dialog.Description>
    </Dialog.Header>

    {#if changeText}
      <div class="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs">
        <Info class="mt-px h-3.5 w-3.5 shrink-0 text-info" />
        <span>{changeText}</span>
      </div>
    {/if}

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border">
      <div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_1.25rem] gap-2 border-b border-border px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Exercise</span><span>Planned</span><span>Done</span><span></span>
      </div>
      {#each rows as r (r.key)}
        <div class="border-b border-border/60 px-5 py-2.5">
          <div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-2 text-[13px]">
            <span class="font-medium">{r.name}</span>
            <span class="tabular-nums text-muted-foreground">{r.planned}</span>
            <span class="tabular-nums {r.status === 'under' ? 'font-medium text-warning' : r.status === 'skipped' ? 'text-muted-foreground' : ''}">{r.status === "skipped" ? "Skipped" : r.done}</span>
            {#if r.status === "done"}
              <Check class="h-4 w-4 text-success" aria-label="As planned" />
            {:else if r.status === "beat"}
              <TrendingUp class="h-4 w-4 text-success" aria-label="Beat the plan" />
            {:else if r.status === "under"}
              <Minus class="h-4 w-4 text-warning" aria-label="Under the plan" />
            {:else if r.status === "swapped"}
              <ArrowRight class="h-4 w-4 text-info" aria-label="Swapped" />
            {:else}
              <span></span>
            {/if}
          </div>
          {#if r.swappedTo}
            <p class="mt-0.5 text-xs text-info">Swapped for {r.swappedTo}</p>
          {:else if r.detail && r.status !== "done"}
            <p class="mt-0.5 text-xs {r.status === 'under' ? 'text-warning' : 'text-muted-foreground'}">{r.detail}</p>
          {/if}
        </div>
      {/each}

      {#if cmp?.added.length}
        <div class="px-5 pt-3 pb-4">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Added on the day</p>
          <p class="mt-1 text-[13px]">{cmp.added.map(blockDisplayName).join(" · ")}</p>
        </div>
      {/if}
    </div>

    {#if onOpenParent || onMatchDay}
      <div class="flex flex-col gap-1 border-t border-border px-5 pt-3 pb-4">
        {#if onOpenParent}
          <Button variant="outline" class="w-full" onclick={onOpenParent}>Open {source.parentName}</Button>
        {/if}
        {#if onMatchDay}
          <Button variant="ghost" class="w-full text-info" onclick={onMatchDay}>
            Make {source.dayNumber ? `Day ${source.dayNumber}` : source.dayName} match this workout…
          </Button>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
