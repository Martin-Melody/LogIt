<!-- The coach swapping an exercise from a message (canvas W6, SW1): "Can I swap the hack
     squat?" → change it in their copy of the program, for the rest of it, and tell them. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { renameExercise, type CoachProgram } from "@logit/core/domain/CoachProgram";
  import { currentProgram } from "../coachingData";

  let { open = $bindable(false), relationshipId, hint = "", ondone }: {
    open?: boolean;
    relationshipId: string;
    /** The message it came from, to guess which exercise. */
    hint?: string;
    ondone?: () => void;
  } = $props();

  let client = $state<ClientRelationship | null>(null);
  let program = $state<CoachProgram | null>(null);
  let loaded = $state(false);
  let from = $state("");
  let to = $state<{ name: string; id?: string } | null>(null);
  let tell = $state(true);
  let busy = $state(false);
  let index = $state<ExerciseIndex | null>(null);

  $effect(() => {
    if (!open) return;
    loaded = false;
    to = null;
    tell = true;
    void (async () => {
      const clients = await coachApi.listClients().catch(() => []);
      client = clients.find((c) => c.relationshipId === relationshipId) ?? null;
      if (client) {
        const rows = await getWebCoachProgramRepo().listMyPrograms({ recipientId: client.client.id }).catch(() => []);
        program = currentProgram(rows.map((r) => r.program))?.program ?? null;
      }
      const names = exercises();
      from = names.find((n) => hint.toLowerCase().includes(n.toLowerCase())) ?? names[0] ?? "";
      loaded = true;
      index ??= await loadExerciseIndex([]).catch(() => null);
    })();
  });

  function exercises(): string[] {
    if (!program) return [];
    return [...new Set(program.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.type === "strength").map((b) => (b as { exerciseName: string }).exerciseName))))];
  }
  const first = $derived((client?.client.displayName || client?.client.username || "them").split(" ")[0]);

  async function save() {
    if (!program || !client || !to || !from || busy) return;
    busy = true;
    try {
      await getWebCoachProgramRepo().saveProgram(renameExercise(program, from, { exerciseName: to.name, exerciseId: to.id }), client.client.username);
      if (tell) {
        await messagesApi.send({
          relationshipId, messageId: createId("msg"), createdAtMs: Date.now(),
          body: `I've swapped ${from} for ${to.name} in your program, for the rest of it.`,
          kind: "program-swap", cardJson: JSON.stringify({ programId: program.id, from, to: to.name }),
        });
      }
      toast.success(`${from} is ${to.name} in ${first}'s program now`);
      open = false;
      ondone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Swap it in {first}'s program</Dialog.Title>
      <Dialog.Description>For the rest of the program. Only {first}'s copy changes, not yours.</Dialog.Description>
    </Dialog.Header>
    {#if !loaded}
      <p class="text-[13px] text-muted-foreground">Loading…</p>
    {:else if !program}
      <p class="text-[13px] text-muted-foreground">{first} isn't on a program from you.</p>
    {:else}
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5"><Label>In {program.name}</Label>
          <OptionSelect bind:value={from} aria-label="Exercise to swap" options={exercises().map((n) => ({ value: n, label: n }))} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Swap for</Label>
          {#if to}
            <span class="flex items-center justify-between rounded-[9px] border border-border px-3 py-2 text-[13px]"><b class="font-medium">{to.name}</b><Button variant="ghost" size="sm" onclick={() => (to = null)}>Change</Button></span>
          {:else}
            <NamePicker id="swap-for" label="Exercise" placeholder="Search exercises" search={(q) => (index?.search(q, 8) ?? []).filter((e) => e.name !== from).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }))} onPick={(n) => (to = { name: n, id: index?.get(n)?.id })} />
          {/if}
        </div>
        <label class="flex items-center justify-between gap-3 text-[13px]"><span>Tell {first}: "I've swapped {from} for {to?.name ?? "…"} in your program"</span><Switch bind:checked={tell} /></label>
      </div>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy || !program || !to} onclick={() => void save()}>{busy ? "Saving…" : "Swap it"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
