<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import { ArrowLeft, Dumbbell, Activity } from "lucide-svelte";

  import { Button } from "$lib/components/ui/button";

  import type { ProgramDay, ProgramStrength } from "@logit/core/domain/CoachProgram";
  import { getBuiltinProgram, isBuiltinProgramId } from "@logit/core/domain/builtinPrograms";
  import { getCoachProgramRepo } from "$lib/data/repoProvider";
  import { currentSession } from "$lib/stores/currentSession.store";

  const props = $props<{ params: { id: string } }>();
  const programId = $derived(props.params.id);
  const program = $derived(getBuiltinProgram(programId));

  const ui = $state({ starting: false, error: null as string | null });
  let openDayId = $state<string | null>(null);
  let isActive = $state(false);

  $effect(() => {
    void getCoachProgramRepo()
      .getActiveProgramId()
      .then((id) => { isActive = id === programId; });
  });

  function sortByOrder<T extends { orderIndex: number }>(a: T[]): T[] {
    return [...a].sort((x, y) => x.orderIndex - y.orderIndex);
  }

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

  async function startDay(day: ProgramDay) {
    if (ui.starting) return;
    ui.starting = true;
    ui.error = null;
    try {
      // Matches Quick Start: an in-progress workout takes precedence over starting a new one.
      if ($currentSession !== null) {
        await goto("/session/current");
        return;
      }
      if (isBuiltinProgramId(programId)) {
        await getCoachProgramRepo().setActiveProgramId(programId);
        isActive = true;
      }
      await currentSession.startFromProgramDay(day);
      await goto("/session/current");
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to start workout";
    } finally {
      ui.starting = false;
    }
  }

  async function stopFollowing() {
    await getCoachProgramRepo().setActiveProgramId(null);
    isActive = false;
  }
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/programs/browse")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold truncate">{program?.name ?? "Program"}</p>
      <p class="text-xs text-muted-foreground">Guided program · pick any day to start</p>
    </div>
    {#if isActive}
      <Button size="sm" variant="ghost" class="shrink-0 text-xs text-muted-foreground" onclick={() => void stopFollowing()}>
        Stop following
      </Button>
    {/if}
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#if !program}
    <p class="px-3 py-4 text-sm text-muted-foreground">Program not found.</p>
  {:else}
    {#if program.description}
      <p class="px-3 py-2 text-sm text-muted-foreground border-b border-border">{program.description}</p>
    {/if}

    <ul class="divide-y divide-border">
      {#each sortByOrder(program.weeks[0]?.days ?? []) as day, i (day.id)}
        <li class="px-3 py-2.5">
          <button
            type="button"
            class="w-full flex items-center gap-3 text-left"
            onclick={() => (openDayId = openDayId === day.id ? null : day.id)}
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{day.name ?? `Day ${i + 1}`}</p>
            </div>
            <span class="text-muted-foreground text-sm shrink-0">{openDayId === day.id ? "▾" : "▸"}</span>
          </button>

          {#if openDayId === day.id}
            <div class="mt-2 flex flex-col gap-1">
              {#each sortByOrder(day.blocks) as block (block.id)}
                <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {#if block.type === "strength"}
                    <Dumbbell class="h-3 w-3 shrink-0" />
                    <span class="truncate">{block.exerciseName}{block.sets.length ? ` · ${setSummary(block)}` : ""}</span>
                  {:else}
                    <Activity class="h-3 w-3 shrink-0" />
                    <span class="truncate">{block.activityName}</span>
                  {/if}
                </p>
              {/each}
            </div>
            <Button
              size="sm"
              variant="outline"
              class="mt-2"
              disabled={ui.starting || day.blocks.length === 0}
              onclick={() => void startDay(day)}
            >
              Start this day
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
