<!-- The weights a phase found (canvas SP4): each lift's top set, its estimated max and how sure
     that is. "Looks right" saves the check; numbers the coach changes win over the client's own.
     Not checked by the next phase's first session, the found numbers apply anyway. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { getWebDeps, getWebCoachProgramRepo } from "$lib/deps";
  import { touchCoachProgram, type CoachProgram, type ProgramPhase } from "@logit/core/domain/CoachProgram";
  import { foundWeights, type FoundWeight } from "@logit/core/domain/phaseHandoff";

  let { open = $bindable(false), clientId, username, name, program, phase, onsaved }: {
    open?: boolean;
    clientId: string;
    username: string;
    name: string;
    program: CoachProgram;
    phase: ProgramPhase;
    onsaved?: () => void;
  } = $props();

  let rows = $state<FoundWeight[] | null>(null);
  let edits = $state<Record<string, string>>({});
  let saving = $state(false);
  $effect(() => {
    if (!open) return;
    rows = null;
    edits = {};
    void getWebDeps(clientId).workoutRepo.listAllSessions().then(
      (s) => (rows = foundWeights(program, phase, s.filter((x) => x.endedAtMs != null))),
      () => (rows = foundWeights(program, phase, [])),
    );
  });
  const first = $derived(name.split(" ")[0] ?? name);
  const HOW = { sure: "Sure", rough: "Rough: an easy or long set", skipped: "Not done" } as const;

  async function save() {
    saving = true;
    try {
      const e1rm: Record<string, number> = {};
      for (const r of rows ?? []) {
        const v = Number((edits[r.exerciseName] ?? "").replace(",", "."));
        if (edits[r.exerciseName] != null && v > 0 && v !== r.e1rm) e1rm[r.exerciseName.toLowerCase()] = v;
      }
      const next = touchCoachProgram({
        ...program,
        handoffs: [...(program.handoffs ?? []).filter((h) => h.phaseId !== phase.id), { phaseId: phase.id, checkedAtMs: Date.now(), ...(Object.keys(e1rm).length ? { e1rm } : {}) }],
      });
      await getWebCoachProgramRepo().saveProgram(next, username);
      toast.success(`Week ${phase.weeks.to + 1} plans from these`);
      open = false;
      onsaved?.();
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{first}'s weights</Dialog.Title>
      <Dialog.Description>From the {phase.name} phase. Week {phase.weeks.to + 1} plans from these; change any that look wrong.</Dialog.Description>
    </Dialog.Header>
    {#if !rows}
      <p class="py-6 text-center text-[13px] text-muted-foreground">Reading {first}'s sessions…</p>
    {:else if !rows.length}
      <p class="py-6 text-center text-[13px] text-muted-foreground">This phase has no exercises with weights.</p>
    {:else}
      <table class="w-full text-[13px]">
        <thead><tr class="text-left text-xs text-muted-foreground"><th class="py-1.5 font-medium">Lift</th><th class="font-medium">Top set</th><th class="font-medium">Estimated max</th><th class="font-medium">How sure</th></tr></thead>
        <tbody>
          {#each rows as r (r.exerciseName)}
            <tr class="border-t border-border">
              <td class="py-2 font-medium">{r.exerciseName}</td>
              <td class="tabular-nums">{r.top ? `${r.top.weight} × ${r.top.reps}${r.top.rpe ? ` @ ${r.top.rpe}` : ""}` : "–"}</td>
              <td><span class="flex items-center gap-1"><input class="h-8 w-20 rounded-[7px] border border-input bg-background px-2 text-right tabular-nums" inputmode="decimal" aria-label="{r.exerciseName} estimated max"
                value={edits[r.exerciseName] ?? (r.e1rm ?? "")} placeholder="–" oninput={(e) => (edits = { ...edits, [r.exerciseName]: e.currentTarget.value })} /> kg</span></td>
              <td class="text-xs {r.how === 'sure' ? '' : 'text-warning'}">{HOW[r.how]}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if rows.some((r) => r.how === "skipped")}
        <p class="text-xs text-muted-foreground">A lift with no number: its first set next week finds it, or type one in.</p>
      {/if}
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Later</Button>
      <Button disabled={!rows || saving} onclick={() => void save()}>{saving ? "Saving…" : "Looks right"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
