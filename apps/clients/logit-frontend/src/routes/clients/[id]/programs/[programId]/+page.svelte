<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Plus, Trash, Copy, Dumbbell, Activity, ChevronDown, ChevronRight } from "lucide-svelte";

  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { SetType } from "@logit/core/domain/workout";
  import { SET_TYPE_META } from "@logit/core/domain/workout";
  import { getAuthoredProgramRepo } from "$lib/data/repoProvider";
  import { saveAuthoredProgram } from "$lib/usecases/coach/saveAuthoredProgram";
  import { deleteAuthoredProgram } from "$lib/usecases/coach/deleteAuthoredProgram";

  const props = $props<{ params: { id: string; programId: string } }>();
  const programId = $derived(props.params.programId);
  const clientId = $derived(props.params.id);
  const username = $derived($page.url.searchParams.get("u") ?? "");

  const ui = $state({ loading: true, saving: false, error: null as string | null });
  let program = $state<CoachProgram | null>(null);
  let openWeekId = $state<string | null>(null);
  let addTarget = $state<{ weekId: string; dayId: string } | null>(null);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const row = await getAuthoredProgramRepo().getMyProgram(programId);
      program = row?.program ?? null;
      openWeekId = program?.weeks[0]?.id ?? null;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load program";
    } finally {
      ui.loading = false;
    }
  }

  /** Every mutation goes through here: apply a domain helper to the current program,
   * persist locally + push to the server. No-ops if the program hasn't loaded. */
  async function run(fn: (p: CoachProgram) => CoachProgram) {
    if (!program) return;
    ui.saving = true;
    ui.error = null;
    try {
      program = await saveAuthoredProgram(fn(program));
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  async function rename(name: string) {
    if (!program || name.trim() === program.name) return;
    await run((p) => P.renameCoachProgram(p, name));
  }

  async function removeProgram() {
    await deleteAuthoredProgram(programId);
    back(`/clients/${clientId}?u=${username}`);
  }

  const setTypes = SET_TYPE_META;

  function num(v: string): number | undefined {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back(`/clients/${clientId}?u=${username}`)}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    {#if program}
      <input
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-transparent focus:border-primary"
        value={program.name}
        disabled={ui.saving}
        onblur={(e) => void rename(e.currentTarget.value)}
        onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      <ConfirmDialog
        title="Delete this program?"
        description="Removes it for you and the client. Cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        saving={ui.saving}
        onConfirm={removeProgram}
      >
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon" class="h-7 w-7 text-destructive" disabled={ui.saving}>
            <Trash class="h-3.5 w-3.5" />
          </Button>
        {/snippet}
      </ConfirmDialog>
    {/if}
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !program}
    <p class="px-3 py-4 text-sm text-muted-foreground">Program not found.</p>
  {:else}
    <p class="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
      Assigned to @{username} · {ui.saving ? "saving…" : "saved"}
    </p>

    {#each [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber) as week (week.id)}
      <div class="border-b border-border">
        <div class="flex items-center">
          <button type="button" class="flex-1 flex items-center gap-2 px-3 py-2.5 text-left"
            onclick={() => (openWeekId = openWeekId === week.id ? null : week.id)}>
            {#if openWeekId === week.id}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight class="h-4 w-4" />{/if}
            <span class="text-sm font-medium">Week {week.weekNumber}</span>
            <Badge variant="secondary" class="text-xs px-1.5 py-0">{week.days.length}d</Badge>
          </button>
          <button type="button" class="p-2 text-muted-foreground hover:text-foreground" title="Duplicate week"
            disabled={ui.saving} onclick={() => void run((p) => P.duplicateWeek(p, week.id))}>
            <Copy class="h-3.5 w-3.5" />
          </button>
          <button type="button" class="p-2 mr-1 text-muted-foreground hover:text-destructive" title="Remove week"
            disabled={ui.saving || program.weeks.length <= 1} onclick={() => void run((p) => P.removeWeek(p, week.id))}>
            <Trash class="h-3.5 w-3.5" />
          </button>
        </div>

        {#if openWeekId === week.id}
          <div class="bg-muted/20 border-t border-border">
            {#each [...week.days].sort((a, b) => a.orderIndex - b.orderIndex) as day, di (day.id)}
              <div class="px-3 py-2 border-b border-border last:border-0">
                <div class="flex items-center gap-2">
                  <input
                    class="flex-1 min-w-0 bg-transparent text-sm font-medium focus:outline-none border-b border-transparent focus:border-primary"
                    value={day.name ?? `Day ${di + 1}`}
                    disabled={ui.saving}
                    onblur={(e) => {
                      const name = e.currentTarget.value.trim();
                      if (name === (day.name ?? `Day ${di + 1}`)) return;
                      void run((p) => ({
                        ...p,
                        weeks: p.weeks.map((x) =>
                          x.id !== week.id ? x : { ...x, days: x.days.map((y) => (y.id === day.id ? { ...y, name } : y)) },
                        ),
                      }));
                    }}
                  />
                  <button type="button" class="p-1 text-muted-foreground hover:text-destructive"
                    disabled={ui.saving} onclick={() => void run((p) => P.removeDay(p, week.id, day.id))}>
                    <Trash class="h-3.5 w-3.5" />
                  </button>
                </div>

                <div class="mt-1.5 flex flex-col gap-1.5">
                  {#each [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) as block (block.id)}
                    <div class="rounded border border-border bg-background p-2">
                      <div class="flex items-center gap-1.5">
                        {#if block.type === "strength"}
                          <Dumbbell class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {:else}
                          <Activity class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {/if}
                        <span class="text-sm font-medium flex-1 truncate">
                          {block.type === "strength" ? block.exerciseName : block.activityName}
                        </span>
                        <button type="button" class="p-1 text-muted-foreground hover:text-destructive"
                          disabled={ui.saving} onclick={() => void run((p) => P.removeBlock(p, week.id, day.id, block.id))}>
                          <Trash class="h-3 w-3" />
                        </button>
                      </div>

                      {#if block.type === "strength"}
                        <ul class="mt-1.5 flex flex-col gap-1">
                          {#each block.sets as set, si (set.id)}
                            <li class="flex items-center gap-1.5 text-xs">
                              <span class="w-5 text-muted-foreground">{si + 1}</span>
                              <input type="number" inputmode="numeric" placeholder="reps" value={set.reps ?? ""}
                                class="w-14 rounded border bg-background px-1 py-0.5"
                                onblur={(e) => void run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { reps: num(e.currentTarget.value) }))} />
                              <input type="number" inputmode="decimal" placeholder="kg" value={set.weight ?? ""}
                                class="w-16 rounded border bg-background px-1 py-0.5"
                                onblur={(e) => void run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { weight: num(e.currentTarget.value) }))} />
                              <input type="number" inputmode="decimal" placeholder="RPE" value={set.rpe ?? ""}
                                class="w-12 rounded border bg-background px-1 py-0.5"
                                onblur={(e) => void run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { rpe: num(e.currentTarget.value) }))} />
                              <select value={set.setType} class="rounded border bg-background px-1 py-0.5"
                                onchange={(e) => void run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { setType: e.currentTarget.value as SetType }))}>
                                {#each setTypes as t}<option value={t.type}>{t.label}</option>{/each}
                              </select>
                              <button type="button" class="ml-auto p-0.5 text-muted-foreground hover:text-destructive"
                                onclick={() => void run((p) => P.removeSet(p, week.id, day.id, block.id, set.id))}>
                                <Trash class="h-3 w-3" />
                              </button>
                            </li>
                          {/each}
                        </ul>
                        <button type="button" class="mt-1 text-xs text-muted-foreground hover:text-foreground"
                          disabled={ui.saving}
                          onclick={() => void run((p) => P.addSet(p, week.id, day.id, block.id, { reps: block.sets.at(-1)?.reps, weight: block.sets.at(-1)?.weight }))}>
                          + set
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>

                {#if addTarget?.weekId === week.id && addTarget?.dayId === day.id}
                  <div class="mt-1.5">
                    <ExerciseSearchInput
                      autofocus
                      placeholder="Add exercise…"
                      onConfirm={(sel) => {
                        void run((p) => P.addStrengthBlock(p, week.id, day.id, { exerciseName: sel.name, exerciseId: sel.exerciseId }));
                        addTarget = null;
                      }}
                    />
                    <button type="button" class="mt-1 text-xs text-muted-foreground" onclick={() => (addTarget = null)}>cancel</button>
                  </div>
                {:else}
                  <button type="button" class="mt-1.5 text-xs text-primary hover:underline"
                    disabled={ui.saving} onclick={() => (addTarget = { weekId: week.id, dayId: day.id })}>
                    + exercise
                  </button>
                {/if}
              </div>
            {/each}

            <button type="button" class="w-full px-3 py-2 text-left text-xs text-primary hover:underline"
              disabled={ui.saving} onclick={() => void run((p) => P.addDay(p, week.id))}>
              + day
            </button>
          </div>
        {/if}
      </div>
    {/each}

    <button type="button" class="flex items-center gap-1.5 px-3 py-3 text-sm text-primary hover:underline"
      disabled={ui.saving} onclick={() => void run((p) => P.addWeek(p))}>
      <Plus class="h-3.5 w-3.5" /> Add week
    </button>
  {/if}
</div>
