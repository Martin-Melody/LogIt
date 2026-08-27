<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import { ArrowLeft, Dumbbell, Activity } from "lucide-svelte";

  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";

  import type { CoachProgram, ProgramDay, ProgramStrength } from "@logit/core/domain/CoachProgram";
  import { getCurrentWeek } from "@logit/core/domain/CoachProgram";
  import { getCoachProgramRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";

  const props = $props<{ params: { id: string } }>();
  const programId = $derived(props.params.id);

  const ui = $state({ loading: true, starting: false, error: null as string | null });
  let program = $state<CoachProgram | null>(null);
  let openWeekId = $state<string | null>(null);

  const currentWeek = $derived(program ? getCurrentWeek(program) : null);
  const weeks = $derived([...(program?.weeks ?? [])].sort((a, b) => a.weekNumber - b.weekNumber));

  function sortByOrder<T extends { orderIndex: number }>(a: T[]): T[] {
    return [...a].sort((x, y) => x.orderIndex - y.orderIndex);
  }

  function dayLabel(day: ProgramDay, i: number): string {
    return `Day ${i + 1}${day.name ? ` — ${day.name}` : ""}`;
  }

  /** "3 × 5" / "3 × 8-10" / "" — a compact prescription summary for a strength block. */
  function setSummary(block: ProgramStrength): string {
    const first = block.sets[0];
    if (!first) return "";
    const reps =
      first.reps != null
        ? String(first.reps)
        : first.repsMin != null
          ? `${first.repsMin}-${first.repsMax ?? ""}`
          : "—";
    return `${block.sets.length} × ${reps}`;
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      program = await getCoachProgramRepo().getAssignedProgram(programId);
      openWeekId = currentWeek?.id ?? program?.weeks[0]?.id ?? null;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load program";
      program = null;
    } finally {
      ui.loading = false;
    }
  }

  async function startDay(day: ProgramDay) {
    if (ui.starting) return;
    ui.starting = true;
    try {
      // Matches Quick Start: an in-progress workout takes precedence over starting a new one.
      if ($currentSession !== null) {
        await goto("/session/current");
        return;
      }
      await getCoachProgramRepo().setActiveProgramId(programId);
      await currentSession.startFromProgramDay(day);
      await goto("/session/current");
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to start workout";
    } finally {
      ui.starting = false;
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/splits")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold truncate">{program?.name ?? "Program"}</p>
      <p class="text-xs text-muted-foreground">From your coach · read-only</p>
    </div>
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !program}
    <p class="px-3 py-4 text-sm text-muted-foreground">Program not found.</p>
  {:else}
    {#if program.description}
      <p class="px-3 py-2 text-sm text-muted-foreground border-b border-border">{program.description}</p>
    {/if}

    {#each weeks as w (w.id)}
      <div class="border-b border-border">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40"
          onclick={() => (openWeekId = openWeekId === w.id ? null : w.id)}
        >
          <span class="text-sm font-medium">
            Week {w.weekNumber}{w.name ? ` — ${w.name}` : ""}
          </span>
          <span class="flex items-center gap-2">
            {#if currentWeek?.id === w.id}
              <Badge variant="secondary" class="text-xs px-1.5 py-0">This week</Badge>
            {/if}
            <span class="text-muted-foreground text-sm">{openWeekId === w.id ? "▾" : "▸"}</span>
          </span>
        </button>

        {#if openWeekId === w.id}
          {#if w.days.length === 0}
            <p class="px-3 pb-3 text-xs text-muted-foreground">No days in this week.</p>
          {:else}
            <ul class="divide-y divide-border border-t border-border">
              {#each sortByOrder(w.days) as day, i (day.id)}
                <li class="flex items-center gap-3 px-3 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium">{dayLabel(day, i)}</p>
                    <div class="mt-1 flex flex-col gap-0.5">
                      {#each sortByOrder(day.blocks) as block (block.id)}
                        <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {#if block.type === "strength"}
                            <Dumbbell class="h-3 w-3 shrink-0" />
                            <span class="truncate">
                              {block.exerciseName}{block.sets.length ? ` · ${setSummary(block)}` : ""}
                            </span>
                          {:else}
                            <Activity class="h-3 w-3 shrink-0" />
                            <span class="truncate">{block.activityName}</span>
                          {/if}
                        </p>
                      {/each}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    class="shrink-0"
                    disabled={ui.starting || day.blocks.length === 0}
                    onclick={() => void startDay(day)}
                  >
                    Start
                  </Button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
