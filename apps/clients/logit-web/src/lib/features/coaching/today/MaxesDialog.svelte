<!-- How far they've come (canvas PX4): a max test is done. Each tested lift's start (from their
     first weeks) against the new max. Send puts it in your conversation; Done clears it. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { getWebDeps, getWebCoachProgramRepo } from "$lib/deps";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { touchCoachProgram, type CoachProgram, type ProgramPhase } from "@logit/core/domain/CoachProgram";
  import { maxesFound, type MaxFound } from "@logit/core/domain/phaseHandoff";

  let { open = $bindable(false), clientId, relationshipId, username, name, program, phase, ondone }: {
    open?: boolean;
    clientId: string;
    relationshipId: string;
    username: string;
    name: string;
    program: CoachProgram;
    phase: ProgramPhase;
    ondone?: () => void;
  } = $props();

  let rows = $state<MaxFound[] | null>(null);
  let busy = $state(false);
  $effect(() => {
    if (!open) return;
    rows = null;
    void getWebDeps(clientId).workoutRepo.listAllSessions().then(
      (s) => (rows = maxesFound(program, phase, s.filter((x) => x.endedAtMs != null))),
      () => (rows = maxesFound(program, phase, [])),
    );
  });
  const first = $derived(name.split(" ")[0] ?? name);
  const pct = (r: MaxFound) => (r.startKg && r.nowKg ? Math.round(((r.nowKg - r.startKg) / r.startKg) * 100) : null);
  const text = $derived(`Your new maxes after ${program.name}:\n${(rows ?? []).filter((r) => r.nowKg).map((r) => `${r.exerciseName}: ${r.nowKg} kg${r.startKg ? ` (from ${r.startKg} kg, ${pct(r)! >= 0 ? "+" : ""}${pct(r)}%)` : ""}`).join("\n")}`);

  /** Marks it seen (like checking found weights), so it leaves Today. */
  async function done(send: boolean) {
    busy = true;
    try {
      if (send) await messagesApi.send({ relationshipId, messageId: createId("msg"), createdAtMs: Date.now(), body: text });
      const next = touchCoachProgram({ ...program, handoffs: [...(program.handoffs ?? []).filter((h) => h.phaseId !== phase.id), { phaseId: phase.id, checkedAtMs: Date.now() }] });
      await getWebCoachProgramRepo().saveProgram(next, username);
      if (send) toast.success(`Sent to ${first}`);
      open = false;
      ondone?.();
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>{first} found their maxes</Dialog.Title>
      <Dialog.Description>Started: their best estimate in the first weeks. Now: the heaviest single in {phase.name}.</Dialog.Description>
    </Dialog.Header>
    {#if !rows}
      <p class="py-6 text-center text-[13px] text-muted-foreground">Reading {first}'s sessions…</p>
    {:else if !rows.length}
      <p class="py-6 text-center text-[13px] text-muted-foreground">No lifts were tested.</p>
    {:else}
      <table class="w-full text-[13px]">
        <thead><tr class="text-left text-xs text-muted-foreground"><th class="py-1.5 font-medium">Lift</th><th class="font-medium">Started</th><th class="font-medium">Now</th><th class="font-medium">Change</th></tr></thead>
        <tbody>
          {#each rows as r (r.exerciseName)}
            {@const p = pct(r)}
            <tr class="border-t border-border">
              <td class="py-2 font-medium">{r.exerciseName}</td>
              <td class="tabular-nums text-muted-foreground">{r.startKg ? `${r.startKg} kg` : "–"}</td>
              <td class="tabular-nums">{r.nowKg ? `${r.nowKg} kg${r.single ? "" : " (est.)"}` : "Not tested"}</td>
              <td class="tabular-nums {p != null && p > 0 ? 'text-success' : 'text-muted-foreground'}">{p != null ? `${p > 0 ? "+" : ""}${p}%` : "–"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if rows.some((r) => r.nowKg && !r.single)}<p class="text-xs text-muted-foreground">(est.): no single was logged, so it's worked out from their best set.</p>{/if}
    {/if}
    <Dialog.Footer>
      <Button variant="outline" disabled={busy} onclick={() => void done(false)}>Done</Button>
      <Button disabled={busy || !rows?.some((r) => r.nowKg)} onclick={() => void done(true)}>Send {first} this</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
