<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { SetType } from "@logit/core/domain/workout";
  import { SET_TYPE_META } from "@logit/core/domain/workout";
  import { getWebCoachProgramRepo } from "$lib/deps";

  const clientId = $derived(page.params.id!);
  const programId = $derived(page.params.programId!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let program = $state<CoachProgram | null>(null);
  let openWeekId = $state<string | null>(null);
  let addTarget = $state<{ weekId: string; dayId: string } | null>(null);
  let newExerciseName = $state("");

  const setTypes = SET_TYPE_META;

  async function load() {
    loading = true;
    error = null;
    try {
      const row = await getWebCoachProgramRepo().getMyProgram(programId);
      program = row?.program ?? null;
      openWeekId = program?.weeks[0]?.id ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load program";
    } finally {
      loading = false;
    }
  }

  /** Apply a domain helper to the current program, then persist (assignment kept by passing
   * the username through every save). */
  async function run(fn: (p: CoachProgram) => CoachProgram) {
    if (!program) return;
    const next = P.touchCoachProgram(fn(program));
    program = next;
    saving = true;
    error = null;
    try {
      await getWebCoachProgramRepo().saveProgram(next, username || undefined);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  let confirmDeleteOpen = $state(false);

  async function removeProgram() {
    confirmDeleteOpen = false;
    try {
      await getWebCoachProgramRepo().deleteProgram(programId);
      await goto(`/clients/${clientId}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete";
    }
  }

  function num(v: string): number | undefined {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }

  $effect(() => {
    void programId;
    void load();
  });
</script>

<div class="flex flex-col gap-3 max-w-3xl">
  <div class="flex items-center justify-between">
    <a href="/clients/{clientId}?u={username}" class="text-xs text-muted-foreground hover:text-foreground">
      &larr; @{username}
    </a>
    {#if program}
      <AlertDialog.Root bind:open={confirmDeleteOpen}>
        <AlertDialog.Trigger>
          {#snippet child({ props })}
            <Button {...props} size="sm" variant="outline" class="text-destructive">Delete program</Button>
          {/snippet}
        </AlertDialog.Trigger>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Delete this program?</AlertDialog.Title>
            <AlertDialog.Description>This removes it for the client too. This can't be undone.</AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <Button variant="destructive" onclick={() => void removeProgram()}>Delete program</Button>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog.Root>
    {/if}
  </div>

  {#if error}
    <Alert.Root variant="destructive">
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if loading}
    <div class="flex flex-col gap-2">
      <Skeleton class="h-8 w-64" />
      <Skeleton class="h-32 w-full" />
    </div>
  {:else if !program}
    <p class="text-sm text-muted-foreground">Program not found.</p>
  {:else}
    <div class="flex items-center gap-3">
      <input
        class="text-lg font-semibold bg-transparent border-b border-transparent focus:border-primary focus:outline-none flex-1"
        value={program.name}
        onblur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== program?.name) void run((p) => P.renameCoachProgram(p, v));
        }}
      />
      <span class="text-xs text-muted-foreground">{saving ? "saving…" : "saved"}</span>
    </div>

    {#each [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber) as week (week.id)}
      <div class="rounded border border-border">
        <div class="flex items-center gap-2 px-3 py-2 bg-muted/30">
          <button type="button" class="flex-1 flex items-center gap-2 text-left text-sm font-medium"
            onclick={() => (openWeekId = openWeekId === week.id ? null : week.id)}>
            <span>{openWeekId === week.id ? "▾" : "▸"}</span>
            Week {week.weekNumber}
            <Badge variant="secondary" class="text-xs px-1.5 py-0">{week.days.length}d</Badge>
          </button>
          <button type="button" class="text-xs text-muted-foreground hover:text-foreground"
            disabled={saving} onclick={() => run((p) => P.duplicateWeek(p, week.id))}>Duplicate</button>
          <button type="button" class="text-xs text-muted-foreground hover:text-destructive"
            disabled={saving || program.weeks.length <= 1} onclick={() => run((p) => P.removeWeek(p, week.id))}>Remove</button>
        </div>

        {#if openWeekId === week.id}
          <div class="divide-y divide-border">
            {#each [...week.days].sort((a, b) => a.orderIndex - b.orderIndex) as day, di (day.id)}
              <div class="p-3">
                <div class="flex items-center gap-2">
                  <input
                    class="flex-1 text-sm font-medium bg-transparent border-b border-transparent focus:border-primary focus:outline-none"
                    value={day.name ?? `Day ${di + 1}`}
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
                  <button type="button" class="text-xs text-muted-foreground hover:text-destructive"
                    disabled={saving} onclick={() => run((p) => P.removeDay(p, week.id, day.id))}>Remove day</button>
                </div>

                <div class="mt-2 flex flex-col gap-2">
                  {#each [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) as block (block.id)}
                    <div class="rounded border border-border p-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium flex-1">
                          {block.type === "strength" ? block.exerciseName : block.activityName}
                        </span>
                        <button type="button" class="text-xs text-muted-foreground hover:text-destructive"
                          disabled={saving} onclick={() => run((p) => P.removeBlock(p, week.id, day.id, block.id))}>Remove</button>
                      </div>

                      {#if block.type === "strength"}
                        <table class="mt-1.5 w-full text-xs">
                          <tbody>
                            {#each block.sets as set, si (set.id)}
                              <tr>
                                <td class="pr-2 text-muted-foreground w-6">{si + 1}</td>
                                <td class="pr-2">
                                  <input type="number" placeholder="reps" value={set.reps ?? ""}
                                    class="w-16 rounded border bg-background px-1 py-0.5"
                                    onblur={(e) => run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { reps: num(e.currentTarget.value) }))} />
                                </td>
                                <td class="pr-2">
                                  <input type="number" placeholder="kg" value={set.weight ?? ""}
                                    class="w-16 rounded border bg-background px-1 py-0.5"
                                    onblur={(e) => run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { weight: num(e.currentTarget.value) }))} />
                                </td>
                                <td class="pr-2">
                                  <input type="number" placeholder="%1RM" value={set.percent1RM ?? ""}
                                    class="w-16 rounded border bg-background px-1 py-0.5"
                                    onblur={(e) => run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { percent1RM: num(e.currentTarget.value) }))} />
                                </td>
                                <td class="pr-2">
                                  <input type="number" placeholder="RPE" value={set.rpe ?? ""}
                                    class="w-14 rounded border bg-background px-1 py-0.5"
                                    onblur={(e) => run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { rpe: num(e.currentTarget.value) }))} />
                                </td>
                                <td class="pr-2">
                                  <select value={set.setType} class="rounded border bg-background px-1 py-0.5"
                                    onchange={(e) => run((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { setType: e.currentTarget.value as SetType }))}>
                                    {#each setTypes as t}<option value={t.type}>{t.label}</option>{/each}
                                  </select>
                                </td>
                                <td>
                                  <button type="button" class="text-muted-foreground hover:text-destructive"
                                    onclick={() => run((p) => P.removeSet(p, week.id, day.id, block.id, set.id))}>✕</button>
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                        <button type="button" class="mt-1 text-xs text-primary hover:underline"
                          disabled={saving}
                          onclick={() => run((p) => P.addSet(p, week.id, day.id, block.id, { reps: block.sets.at(-1)?.reps, weight: block.sets.at(-1)?.weight }))}>
                          + set
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>

                {#if addTarget?.weekId === week.id && addTarget?.dayId === day.id}
                  <form
                    class="mt-2 flex gap-2"
                    onsubmit={(e) => {
                      e.preventDefault();
                      const name = newExerciseName.trim();
                      if (!name) return;
                      void run((p) => P.addStrengthBlock(p, week.id, day.id, { exerciseName: name }));
                      newExerciseName = "";
                      addTarget = null;
                    }}
                  >
                    <input
                      bind:value={newExerciseName}
                      placeholder="Exercise name"
                      class="flex-1 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button type="submit" size="sm">Add</Button>
                    <button type="button" class="text-xs text-muted-foreground" onclick={() => (addTarget = null)}>cancel</button>
                  </form>
                {:else}
                  <button type="button" class="mt-2 text-xs text-primary hover:underline"
                    disabled={saving} onclick={() => { addTarget = { weekId: week.id, dayId: day.id }; newExerciseName = ""; }}>
                    + exercise
                  </button>
                {/if}
              </div>
            {/each}

            <button type="button" class="w-full px-3 py-2 text-left text-xs text-primary hover:underline"
              disabled={saving} onclick={() => run((p) => P.addDay(p, week.id))}>+ day</button>
          </div>
        {/if}
      </div>
    {/each}

    <Button size="sm" variant="outline" disabled={saving} onclick={() => run((p) => P.addWeek(p))}>+ Add week</Button>
  {/if}
</div>
