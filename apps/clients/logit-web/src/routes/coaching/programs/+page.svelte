<script lang="ts">
  import { DateField } from "$lib/components/ui/date-field/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import ProgramEditor from "$lib/features/coaching/ProgramEditor.svelte";
  import SwapDefaultCard from "$lib/features/coaching/SwapDefaultCard.svelte";
  import type { SwapRule } from "@logit/core/domain/swaps";

  // Coaching › Programs: your library. Assigning gives a client their own copy (the server
  // keeps one row per client); saving here can push the change to the copies you tick.

  let rows = $state<MyCoachProgram[]>([]);
  let clients = $state<ClientRelationship[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let swapRule = $state<SwapRule>("any");

  let assignOpen = $state(false);
  let assignTo = $state("");
  let startMode = $state<"date" | "manual">("date");
  let startDate = $state(P.toDateInputValue(P.startOfLocalDayMs() + 86_400_000));

  const library = $derived(rows.filter((r) => r.recipientUserId === null).map((r) => r.program).sort((a, b) => a.name.localeCompare(b.name)));
  const active = $derived(library.filter((p) => !p.archived));
  const archived = $derived(library.filter((p) => p.archived));
  const selectedId = $derived(page.url.searchParams.get("id") ?? active[0]?.id ?? null);
  const selected = $derived(library.find((p) => p.id === selectedId) ?? null);

  const nameOf = (userId: string | null) => {
    const c = clients.find((x) => x.client.id === userId)?.client;
    return c ? c.displayName || c.username : "a former client";
  };
  /** Live client copies made from a library program. */
  function copiesOf(id: string) {
    return rows.filter((r) => r.recipientUserId && r.program.sourceProgramId === id && !r.program.archived);
  }
  function usedBy(id: string): string {
    const names = copiesOf(id).map((r) => nameOf(r.recipientUserId));
    return names.length ? names.join(", ") : "not assigned";
  }

  async function load() {
    try {
      let settings: { swapRule: SwapRule };
      [rows, clients, settings] = await Promise.all([
        getWebCoachProgramRepo().listMyPrograms(),
        coachApi.listClients(),
        coachApi.getCoachSettings().catch(() => ({ swapRule: "any" as SwapRule })),
      ]);
      swapRule = settings.swapRule;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your programs";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  function select(id: string) {
    void goto(`/coaching/programs?id=${id}`, { noScroll: true, keepFocus: true });
  }

  async function create() {
    busy = true;
    try {
      let p = P.createCoachProgram("New program");
      p = P.addDay(p, p.weeks[0].id, "Day 1");
      await getWebCoachProgramRepo().saveProgram(p);
      rows = [...rows, { program: p, recipientUserId: null }];
      select(p.id);
      guideSignal("program.created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create it");
    } finally {
      busy = false;
    }
  }

  async function duplicate() {
    if (!selected) return;
    busy = true;
    try {
      const { sourceProgramId: _s, ...rest } = P.copyProgramForClient(selected, { mode: "manual" });
      const p: CoachProgram = { ...rest, name: `${selected.name} (copy)` };
      await getWebCoachProgramRepo().saveProgram(p);
      rows = [...rows, { program: p, recipientUserId: null }];
      select(p.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't duplicate it");
    } finally {
      busy = false;
    }
  }

  async function setArchived(archive: boolean) {
    if (!selected) return;
    try {
      const p = P.archiveCoachProgram(selected, archive);
      await getWebCoachProgramRepo().saveProgram(p);
      rows = rows.map((r) => (r.program.id === p.id ? { ...r, program: p } : r));
      toast.success(archive ? "Archived. Clients keep their copies." : "Back in your library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  async function save(next: CoachProgram, updateCopies: string[]) {
    const repo = getWebCoachProgramRepo();
    await repo.saveProgram(next);
    let updated = 0;
    for (const id of updateCopies) {
      const row = rows.find((r) => r.program.id === id);
      const username = clients.find((c) => c.client.id === row?.recipientUserId)?.client.username;
      if (!row || !username) continue;
      const copy = P.updateCopyFromTemplate(row.program, next);
      await repo.saveProgram(copy, username);
      rows = rows.map((r) => (r.program.id === id ? { ...r, program: copy } : r));
      updated++;
    }
    rows = rows.map((r) => (r.program.id === next.id ? { ...r, program: next } : r));
    toast.success(updated ? `Saved, and updated ${updated} client cop${updated === 1 ? "y" : "ies"}` : "Saved");
  }

  async function assign() {
    if (!selected || !assignTo) return;
    const c = clients.find((x) => x.client.id === assignTo);
    if (!c) return;
    busy = true;
    try {
      const start = startMode === "manual"
        ? ({ mode: "manual" } as const)
        : ({ mode: "fixed-date", startDateMs: P.fromDateInputValue(startDate) ?? P.startOfLocalDayMs() } as const);
      const copy = P.copyProgramForClient(selected, start);
      await getWebCoachProgramRepo().saveProgram(copy, c.client.username);
      rows = [...rows, { program: copy, recipientUserId: c.client.id }];
      assignOpen = false;
      guideSignal("program.assigned");
      toast.success(`${selected.name} assigned to ${c.client.displayName || c.client.username}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't assign it");
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Programs</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">Your library. Assigning a program gives the client their own copy.</p>
    </div>
    <button type="button" data-guide="programs-new" disabled={busy} onclick={create} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">New program</button>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-72 flex-[1_1_240px]" /><Skeleton class="h-[480px] flex-[999_1_600px]" /></div>
  {:else}
    <SwapDefaultCard bind:rule={swapRule} {clients} />
    <div class="flex flex-wrap items-start gap-4">
      <nav aria-label="Library" data-guide="programs-library" class="flex flex-[1_1_240px] flex-col gap-0.5 rounded-[10px] border border-border bg-card p-1.5">
        {#each active as p (p.id)}
          <button type="button" onclick={() => select(p.id)} aria-current={p.id === selectedId ? "true" : undefined}
            class="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left {p.id === selectedId ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
            <span class="text-sm font-semibold">{p.name}</span>
            <span class="text-xs text-muted-foreground">{p.weeks.length} week{p.weeks.length === 1 ? "" : "s"} · {p.weeks[0]?.days.length ?? 0} day{(p.weeks[0]?.days.length ?? 0) === 1 ? "" : "s"} · {usedBy(p.id)}</span>
          </button>
        {:else}
          <p class="p-3 text-[13px] text-muted-foreground">Nothing here yet. Build a program once and assign it to anyone.</p>
        {/each}
        {#if archived.length}
          <div class="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Archived</div>
          {#each archived as p (p.id)}
            <button type="button" onclick={() => select(p.id)} class="rounded-lg px-3 py-2 text-left text-[13px] text-muted-foreground {p.id === selectedId ? 'bg-muted' : 'hover:bg-muted/50'}">{p.name}</button>
          {/each}
        {/if}
      </nav>

      {#if selected}
        {@const copies = copiesOf(selected.id).map((r) => ({ id: r.program.id, label: `${nameOf(r.recipientUserId)}'s copy` }))}
        <section class="flex min-w-0 flex-[999_1_600px] flex-col gap-3.5 rounded-[10px] border border-border bg-card px-[22px] py-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs text-muted-foreground">{selected.archived ? "Archived" : `Used by ${usedBy(selected.id)}`}</p>
            <span class="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onclick={duplicate} class="h-[30px] rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">Duplicate</button>
              <button type="button" onclick={() => setArchived(!selected.archived)} class="h-[30px] rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">{selected.archived ? "Unarchive" : "Archive"}</button>
              {#if !selected.archived}
                <button type="button" data-guide="programs-assign" disabled={clients.length === 0} onclick={() => { assignTo = clients[0]?.client.id ?? ""; assignOpen = true; }}
                  class="h-[30px] rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Assign to client</button>
              {/if}
            </span>
          </div>
          {#key selected.id}
            <ProgramEditor program={selected} mode="library" {copies} {swapRule} onSave={save} />
          {/key}
        </section>
      {/if}
    </div>
  {/if}
</div>

<Dialog.Root bind:open={assignOpen}>
  <Dialog.Content class="sm:max-w-[480px]">
    <Dialog.Header>
      <Dialog.Title>Assign {selected?.name}</Dialog.Title>
      <Dialog.Description>The client gets their own copy. Percent loads use their own lifts.</Dialog.Description>
    </Dialog.Header>
    <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Client
      <NativeSelect.Root bind:value={assignTo}>
        {#each clients as c (c.client.id)}<NativeSelect.Option value={c.client.id}>{c.client.displayName || c.client.username}</NativeSelect.Option>{/each}
      </NativeSelect.Root>
    </label>
    <span id="lib-start" class="text-xs font-medium text-muted-foreground">Starts</span>
    <RadioGroup.Root bind:value={startMode} aria-labelledby="lib-start" class="flex flex-col gap-1.5">
      <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2 text-[13px] {startMode === 'date' ? 'border-primary bg-muted' : 'border-border'}">
        <RadioGroup.Item value="date" /><span class="flex-1">On a date</span>
        <DateField bind:value={startDate} aria-label="Start date" disabled={startMode !== "date"} class="h-8 w-auto text-[13px]" />
      </label>
      <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] {startMode === 'manual' ? 'border-primary bg-muted' : 'border-border'}">
        <RadioGroup.Item value="manual" /><span>When they tap Start on their phone</span>
      </label>
    </RadioGroup.Root>
    <Dialog.Footer>
      <button type="button" onclick={() => (assignOpen = false)} class="h-9 rounded-[9px] border border-border px-3.5 text-[13px] hover:bg-muted">Cancel</button>
      <button type="button" disabled={busy || !assignTo} onclick={assign} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Assign</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
