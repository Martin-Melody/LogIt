<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import {
    cadenceText,
    copyTarget,
    prText,
    sharedBlockTarget,
    type SharedHabit,
    type SharedLibraryItem,
    type SharedSplit,
  } from "@logit/core/domain/sharedContent";
  import { copyHabit, copyLibrary, copySplit, type CopyResult } from "./socialData.svelte";

  // Everything a post's attachment carries, laid out on the post page, with Copy to mine.
  let { type, payloadJson, authorName, isOwn }: { type: string; payloadJson: string | null; authorName: string; isOwn: boolean } = $props();

  const p = $derived.by((): Record<string, any> | null => {
    if (!payloadJson) return null;
    try { return JSON.parse(payloadJson); } catch { return null; }
  });
  const target = $derived(copyTarget(type));
  let copying = $state(false);
  let copied = $state<CopyResult | null>(null);

  const COPY_LABEL = { split: "Copy to my splits", library: "Copy to my library", habit: "Copy to my habits" } as const;
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  async function copy() {
    if (!p || copying) return;
    copying = true;
    try {
      copied =
        target === "split" ? await copySplit(p as SharedSplit)
        : target === "library" ? await copyLibrary(p as SharedLibraryItem)
        : await copyHabit(p as SharedHabit);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy it");
    } finally {
      copying = false;
    }
  }

  const label = $derived(
    type === "Exercise" ? (p?.kind === "cardio" ? "Cardio" : p?.kind === "mobility" ? "Mobility" : "Exercise")
    : ({ WorkoutSession: "Workout", PersonalRecord: "Personal record", Split: "Split", Algorithm: "Algorithm", Widget: "Widget", Habit: "Habit" } as Record<string, string>)[type] ?? "",
  );
  const trainingDays = $derived(type === "Split" ? ((p?.days ?? []) as SharedSplit["days"]).filter((d) => !d.rest) : []);
  const splitLine = $derived.by(() => {
    if (type !== "Split" || !p) return "";
    const days = trainingDays.map((d) => (typeof d.weekday === "number" ? DAY[d.weekday] : null)).filter(Boolean);
    const exercises = trainingDays.reduce((n, d) => n + d.blocks.length, 0);
    const custom = ((p.customExercises ?? []) as { name: string }[]).map((e) => e.name);
    return [
      days.length ? days.join(", ") : `${trainingDays.length} days`,
      `${exercises} exercises`,
      custom.length ? `${custom.length === 1 ? "1 is" : `${custom.length} are`} ${authorName}'s own (${custom.join(", ")})` : "",
    ].filter(Boolean).join(" · ");
  });
</script>

{#if p}
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2.5 pt-1">
      <span>
        <span class="text-[11px] font-semibold uppercase tracking-wide {type === 'PersonalRecord' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}">{label}</span>
        <span class="mt-0.5 block text-lg font-bold">{type === "PersonalRecord" ? p.exerciseName : type === "WorkoutSession" ? `${Math.round((p.duration ?? 0) / 60000)} min` : p.name}</span>
        {#if splitLine}<span class="text-xs text-muted-foreground">{splitLine}</span>{/if}
      </span>
      {#if !isOwn && (target === "split" || target === "library" || target === "habit") && !copied}
        <button type="button" onclick={copy} disabled={copying} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{copying ? "Copying…" : COPY_LABEL[target]}</button>
      {/if}
    </div>

    {#if type === "Split"}
      <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
        {#each trainingDays as day, i (i)}
          <div class="flex flex-col gap-1.5 rounded-lg bg-muted/60 px-3.5 py-3">
            <span class="text-[13px] font-semibold">{day.name || `Day ${i + 1}`}{#if typeof day.weekday === "number"}<span class="font-normal text-muted-foreground">{` · ${DAY[day.weekday]}`}</span>{/if}</span>
            {#each day.blocks as b (b.orderIndex)}
              <span class="flex justify-between gap-3 text-[13px]">
                <span class="min-w-0 truncate">{b.type === "strength" ? b.exerciseName : b.type === "mobility" ? b.drillName : b.activityName}</span>
                <span class="shrink-0 text-muted-foreground">{sharedBlockTarget(b)}</span>
              </span>
            {:else}
              <span class="text-xs text-muted-foreground">Nothing planned</span>
            {/each}
          </div>
        {/each}
      </div>
    {:else if type === "WorkoutSession"}
      <ul class="divide-y divide-border rounded-lg border border-border">
        {#each (p.exercises ?? []) as ex, i (i)}
          <li class="flex justify-between px-3.5 py-2 text-[13px]"><span>{ex.name}</span><span class="text-muted-foreground">{ex.sets} set{ex.sets === 1 ? "" : "s"}</span></li>
        {/each}
      </ul>
    {:else if type === "PersonalRecord"}
      <p class="text-sm text-muted-foreground">{prText(p.weight, p.unit, p.reps)}</p>
    {:else if type === "Exercise"}
      <div class="flex flex-col gap-1.5 rounded-lg bg-muted/60 px-3.5 py-3 text-[13px]">
        {#if p.primaryMuscles?.length}<p><span class="text-muted-foreground">Works:</span> {p.primaryMuscles.join(", ")}{p.secondaryMuscles?.length ? ` (also ${p.secondaryMuscles.join(", ")})` : ""}</p>{/if}
        {#if p.kind === "mobility" && p.area}<p><span class="text-muted-foreground">Area:</span> {p.area}{p.perSide ? " · each side" : ""}</p>{/if}
        {#if p.kind === "cardio"}<p><span class="text-muted-foreground">Measured by:</span> {p.measures === "time" ? "time" : "time and distance"}</p>{/if}
        {#if p.cues?.length}<ul class="list-disc pl-5">{#each p.cues as cue, i (i)}<li>{cue}</li>{/each}</ul>{/if}
        {#if p.notes}<p class="whitespace-pre-wrap text-muted-foreground">{p.notes}</p>{/if}
      </div>
    {:else if type === "Habit"}
      <p class="text-sm text-muted-foreground">{cadenceText(p.cadence)}{p.target?.value ? ` · ${p.target.value}${p.target.unit ? ` ${p.target.unit}` : ""}` : ""}</p>
    {:else if type === "Algorithm" || type === "Widget"}
      {#if p.description}<p class="text-sm text-muted-foreground">{p.description}</p>{/if}
      {#if !isOwn}<p class="text-xs text-muted-foreground">Set this up on your phone: open this post in the LogIt app and tap Copy to mine.</p>{/if}
    {/if}

    {#if copied}
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-[13px]">
        <span>{copied.message} It's on your phone after its next sync.</span>
        <a href={copied.href} class="font-semibold">Open ›</a>
      </div>
    {/if}
  </div>
{/if}
