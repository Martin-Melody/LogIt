<!-- Canvas W6 on the phone: swap an exercise in a client's program from their message ("Can I swap
     the hack squat?"), for the rest of it. Only their copy changes. Same as the web's dialog. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { toast } from "$lib/components/ui/sonner/index";
  import type { LibraryEntry } from "@logit/core/domain/library";
  import { getProgramProgress, renameExercise, type CoachProgram } from "@logit/core/domain/CoachProgram";
  import { createRemoteCoachProgramRepo } from "@logit/core/data/remote/remoteCoachProgramRepo";
  import { loadLibrary } from "$lib/data/library/library";
  import { sendMessage } from "$lib/usecases/messages/sendMessage";
  import { saveAuthoredProgram } from "$lib/usecases/coach/saveAuthoredProgram";

  let { open = $bindable(false), relationshipId, clientId, username, name, hint = "" }: {
    open?: boolean; relationshipId: string; clientId: string; username: string; name: string; hint?: string;
  } = $props();
  const first = $derived(name.split(" ")[0] || name);

  let program = $state<CoachProgram | null>(null);
  let loaded = $state(false);
  let from = $state("");
  let to = $state<{ name: string; id?: string } | null>(null);
  let query = $state("");
  let tell = $state(true);
  let busy = $state(false);
  let library = $state<LibraryEntry[]>([]);

  $effect(() => {
    if (!open) return;
    loaded = false; to = null; tell = true; query = "";
    void (async () => {
      // From the server: programs made on the web aren't kept on the phone.
      const mine = (await createRemoteCoachProgramRepo().listMyPrograms({ recipientId: clientId }).catch(() => [])).map((m) => m.program);
      program = mine.filter((p) => !p.archived && getProgramProgress(p).status !== "finished").sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0] ?? null;
      const names = exercises();
      from = names.find((n) => hint.toLowerCase().includes(n.toLowerCase())) ?? names[0] ?? "";
      loaded = true;
      if (!library.length) library = await loadLibrary("strength").catch(() => []);
    })();
  });
  function exercises(): string[] {
    if (!program) return [];
    return [...new Set(program.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.type === "strength").map((b) => (b as { exerciseName: string }).exerciseName))))];
  }
  const results = $derived(query.trim().length < 2 ? [] : library.filter((e) => e.item.name.toLowerCase().includes(query.trim().toLowerCase()) && e.item.name !== from).slice(0, 8));

  async function save() {
    if (!program || !to || !from || busy) return;
    busy = true;
    try {
      await saveAuthoredProgram(renameExercise(program, from, { exerciseName: to.name, exerciseId: to.id }), username);
      if (tell) await sendMessage(relationshipId, `I've swapped ${from} for ${to.name} in your program, for the rest of it.`, undefined, undefined, { kind: "program-swap", json: JSON.stringify({ programId: program.id, from, to: to.name }) });
      toast.success(`${from} is ${to.name} in ${first}'s program now`);
      open = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90svh] flex-col gap-3 overflow-y-auto p-4 sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Swap it in {first}'s program</Dialog.Title>
      <Dialog.Description>For the rest of the program. Only {first}'s copy changes.</Dialog.Description>
    </Dialog.Header>
    {#if !loaded}
      <p class="text-[15px] text-muted-foreground">Loading…</p>
    {:else if !program}
      <p class="text-[15px] text-muted-foreground">{first} isn't on a program from you.</p>
    {:else}
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In {program.name}</p>
      <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Exercise to swap">
        {#each exercises() as n (n)}
          <button type="button" role="radio" aria-checked={from === n} class="min-h-10 rounded-full border px-3.5 text-[14px] {from === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}" onclick={() => (from = n)}>{n}</button>
        {/each}
      </div>
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Swap for</p>
      {#if to}
        <span class="flex min-h-12 items-center justify-between rounded-[12px] border border-border px-3.5 text-[15px]"><b class="font-medium">{to.name}</b><Button variant="ghost" size="sm" onclick={() => (to = null)}>Change</Button></span>
      {:else}
        <input type="search" bind:value={query} placeholder="Search exercises" aria-label="Search exercises"
          class="h-12 rounded-[12px] border border-input bg-background px-3.5 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
        <ul class="flex flex-col gap-1">
          {#each results as e (e.item.id)}
            <li><button type="button" class="flex min-h-12 w-full items-center rounded-[12px] border border-border px-3.5 text-left text-[15px] active:bg-muted" onclick={() => (to = { name: e.item.name, id: e.item.id })}>{e.item.name}</button></li>
          {/each}
        </ul>
      {/if}
      <Switch checked={tell} label={`Tell ${first}: "I've swapped ${from} for ${to?.name ?? "…"} in your program"`} onchange={(v) => (tell = v)} />
      <Button class="h-12" disabled={busy || !to} onclick={() => void save()}>{busy ? "Saving…" : "Swap it"}</Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
