<script lang="ts">
  import { updateCopy } from "@logit/core/domain/programBuilder";
  import { forBuilder } from "@logit/core/domain/programBuilder";
  import ProgramBuilder from "$lib/features/coaching/programs/ProgramBuilder.svelte";
  import { onSampleActivity } from "$lib/features/guide/sampleActivity";
  import { inView } from "$lib/features/coaching/coachingData";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import ProgramEditor from "$lib/features/coaching/ProgramEditor.svelte";
  import RulesTab from "$lib/features/coaching/programs/RulesTab.svelte";
  import ExercisesTab from "$lib/features/coaching/programs/ExercisesTab.svelte";
  import AssignProgramDialog from "$lib/features/coaching/programs/AssignProgramDialog.svelte";
  import StartFromProgramDialog from "$lib/features/coaching/programs/StartFromProgramDialog.svelte";
  import { communityPacks, logitPrograms } from "$lib/features/coaching/programs/programSources";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import type { HostedRegistryEntry } from "@logit/core/api/pluginsApi";
  import type { SwapRule } from "@logit/core/domain/swaps";

  // Coaching › Programs (canvas PG1): yours, LogIt's and the community's. LogIt and community
  // programs are read-only until copied, so a pack update never changes a client's program.
  // Opening one of yours shows its editor; assigning gives a client their own copy, and saving
  // can push the change to the copies you tick.

  let rows = $state<MyCoachProgram[]>([]);
  let clients = $state<ClientRelationship[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let swapRule = $state<SwapRule>("any");

  let assignOpen = $state(false);
  let assignFor = $state<CoachProgram | null>(null);
  type Source = "yours" | "logit" | "community";
  // Canvas PG1/PG10: Programs and Rules (Exercises joins them in 2.6).
  const pageTab = $derived.by(() => { const t = page.url.searchParams.get("tab"); return t === "rules" || t === "exercises" ? t : "programs"; });
  const setPageTab = (v: string) => void goto(v === "programs" ? "/coaching/programs" : `/coaching/programs?tab=${v}`, { replaceState: true, noScroll: true, keepFocus: true });
  let source = $state<Source>("yours");
  let startOpen = $state(false);
  let startTab = $state<Source>("logit");
  let showArchived = $state(false);
  let packs = $state<HostedRegistryEntry[]>([]);
  const logit = logitPrograms();

  const library = $derived(rows.filter((r) => r.recipientUserId === null).map((r) => r.program).sort((a, b) => a.name.localeCompare(b.name)));
  const active = $derived(library.filter((p) => !p.archived));
  const archived = $derived(library.filter((p) => p.archived));
  const selectedId = $derived(page.url.searchParams.get("id"));
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
      clients = inView(clients);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your programs";
    } finally {
      loading = false;
    }
  }
  onMount(load);
  onMount(() => void communityPacks().then((p) => (packs = p), () => {}));
  // ?start=logit|community (from Plugins, or the T1 card's "Browse programs"): open the picker there.
  onMount(() => {
    const s = page.url.searchParams.get("start");
    if (s === "logit" || s === "community" || s === "yours") { startTab = s; startOpen = true; }
  });

  /** Copy a LogIt or community program into yours (or duplicate one of yours), then open it. */
  async function copyIn(pick: { program: CoachProgram; origin: CoachProgram["origin"] | null }) {
    const p = pick.origin
      ? P.copyToMyPrograms(pick.program, pick.origin)
      : P.duplicateProgram(pick.program, `${pick.program.name} (copy)`);
    try {
      await getWebCoachProgramRepo().saveProgram(p);
      rows = [...rows, { program: p, recipientUserId: null }];
      toast.success(`${p.name} is in your programs`);
      select(p.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy it");
      throw e;
    }
  }

  function clientsOn(id: string): number {
    return new Set(copiesOf(id).map((r) => r.recipientUserId)).size;
  }

  const rowActions = (p: CoachProgram): RowAction[] => [
    { id: "open", label: `Open ${p.name}`, run: () => select(p.id) },
    { id: "assign", label: "Assign…", run: () => { assignFor = p; assignOpen = true; }, disabled: p.archived ? "Archived" : clients.length === 0 ? "No clients yet" : undefined, separatorBefore: true },
    { id: "duplicate", label: "Duplicate", run: () => void duplicateOf(p) },
    p.archived
      ? { id: "unarchive", label: "Back in your programs", run: () => void setArchivedOf(p, false) }
      : { id: "archive", label: "Archive", run: () => void setArchivedOf(p, true), separatorBefore: true },
  ];
  // Practice view switched, or a sample did something: the clients to assign to change.
  onMount(() => onSampleActivity(() => void load()));

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

  // ?new=1 (from ⌘K): start a new program once the list has loaded.
  $effect(() => {
    if (loading || !page.url.searchParams.has("new")) return;
    untrack(() => void goto("/coaching/programs", { replaceState: true, noScroll: true }).then(create));
  });

  const duplicate = () => (selected ? duplicateOf(selected) : Promise.resolve());
  async function duplicateOf(from: CoachProgram) {
    busy = true;
    try {
      const p = P.duplicateProgram(from, `${from.name} (copy)`);
      await getWebCoachProgramRepo().saveProgram(p);
      rows = [...rows, { program: p, recipientUserId: null }];
      select(p.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't duplicate it");
    } finally {
      busy = false;
    }
  }

  const setArchived = (archive: boolean) => (selected ? setArchivedOf(selected, archive) : Promise.resolve());
  async function setArchivedOf(of: CoachProgram, archive: boolean) {
    try {
      const p = P.archiveCoachProgram(of, archive);
      await getWebCoachProgramRepo().saveProgram(p);
      rows = rows.map((r) => (r.program.id === p.id ? { ...r, program: p } : r));
      toast.success(archive ? "Archived. Clients keep their copies." : "Back in your library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  /** Canvas Q6: the ticked clients' copies take your library changes; changes made for each
   * client stay (updateCopy). */
  async function updateCopiesOf(next: CoachProgram, ids: string[]): Promise<number> {
    const repo = getWebCoachProgramRepo();
    let updated = 0;
    for (const id of ids) {
      const row = rows.find((r) => r.program.id === id);
      const username = clients.find((c) => c.client.id === row?.recipientUserId)?.client.username;
      if (!row || !username) continue;
      const copy = updateCopy(row.program, next).program;
      await repo.saveProgram(copy, username);
      rows = rows.map((r) => (r.program.id === id ? { ...r, program: copy } : r));
      updated++;
    }
    return updated;
  }
  async function pushToCopies(next: CoachProgram, ids: string[]) {
    const updated = await updateCopiesOf(next, ids);
    toast.success(`Updated ${updated} ${updated === 1 ? "client" : "clients"}. They see it from their next session.`);
  }

  async function save(next: CoachProgram, updateCopies: string[]) {
    const repo = getWebCoachProgramRepo();
    await repo.saveProgram(next);
    const updated = await updateCopiesOf(next, updateCopies);
    rows = rows.map((r) => (r.program.id === next.id ? { ...r, program: next } : r));
    toast.success(updated ? `Saved, and updated ${updated} client cop${updated === 1 ? "y" : "ies"}` : "Saved");
  }

</script>

<div class="flex flex-col gap-4">
  {#if selected}
    <!-- One of yours, open: its editor (the builder comes in 2.3). -->
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <a href="/coaching/programs" class="text-xs text-muted-foreground hover:text-foreground">← Programs</a>
        <h1 class="text-[26px] font-bold tracking-tight">{selected.name}</h1>
        <p class="mt-0.5 text-[13px] text-muted-foreground">{P.programSummary(selected)} · {selected.archived ? "archived" : copiesOf(selected.id).length ? `used by ${usedBy(selected.id)}` : "not assigned yet"}{selected.origin ? ` · from ${selected.origin.kind === "logit" ? "LogIt" : "the community"}${selected.origin.name !== selected.name ? `: ${selected.origin.name}` : ""}` : ""}</p>
      </div>
      <span class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onclick={() => void duplicate()}>Duplicate</Button>
        <Button variant="outline" size="sm" onclick={() => void setArchived(!selected.archived)}>{selected.archived ? "Unarchive" : "Archive"}</Button>
        {#if !selected.archived}
          <Button size="sm" data-guide="programs-assign" disabled={clients.length === 0} onclick={() => { assignFor = selected; assignOpen = true; }}>Assign…</Button>
        {/if}
      </span>
    </header>
    {@const copies = copiesOf(selected.id).map((r) => ({ id: r.program.id, label: nameOf(r.recipientUserId), program: r.program }))}
    <section class="flex min-w-0 flex-col gap-3.5 rounded-[10px] border border-border bg-card px-[22px] py-5">
      {#key selected.id}
        {@const shaped = forBuilder(selected)}
        {#if shaped}
          <ProgramBuilder program={shaped} mode="library" {copies} {swapRule} updateCopies={pushToCopies}
            preview={copiesOf(selected.id).filter((r) => r.recipientUserId).map((r) => ({ clientId: r.recipientUserId!, label: nameOf(r.recipientUserId) }))}
            onchange={(p) => (rows = rows.map((r) => (r.program.id === p.id ? { ...r, program: p } : r)))} />
        {:else}
          <p class="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px]">This program's weeks have different exercises, so it's edited week by week.</p>
          <ProgramEditor program={selected} mode="library" {copies} {swapRule} onSave={save} />
        {/if}
      {/key}
    </section>
  {:else}
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[26px] font-bold tracking-tight">Programs</h1>
        <p class="mt-1 text-[13px] text-muted-foreground">Build once, assign to anyone. Each client gets their own copy.</p>
      </div>
      <span class="flex flex-wrap gap-2">
        {#if pageTab === "rules"}
          <Button href="/coaching/programs/rules/new">New rule</Button>
        {:else if pageTab === "exercises"}
          <Button href="/library">New exercise</Button>
        {:else}
          <Button variant="outline" onclick={() => { startTab = source === "community" ? "community" : "logit"; startOpen = true; }}>Start from a program</Button>
          <Button data-guide="programs-new" disabled={busy} onclick={() => void create()}>New program</Button>
        {/if}
      </span>
    </header>

    {#if error}
      <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
    {:else if loading}
      <Skeleton class="h-72" />
    {:else}
      <Tabs.Root value={pageTab} onValueChange={setPageTab}>
        <Tabs.List variant="line" aria-label="Programs, exercises and rules">
          <Tabs.Trigger value="programs">Programs</Tabs.Trigger>
          <Tabs.Trigger value="exercises">Exercises</Tabs.Trigger>
          <Tabs.Trigger value="rules">Rules</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      {#if pageTab === "rules"}
        <RulesTab programs={library} {clients} bind:swapRule />
      {:else if pageTab === "exercises"}
        <ExercisesTab programs={active} assigned={rows.filter((r) => r.recipientUserId !== null && !r.program.archived).map((r) => r.program)} />
      {:else}
      <div class="inline-flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px] text-[13px]" role="radiogroup" aria-label="Whose programs">
        {#each [["yours", "Yours", active.length], ["logit", "LogIt", logit.length], ["community", "Community", packs.length]] as [v, l, n] (v)}
          <button type="button" role="radio" aria-checked={source === v} onclick={() => (source = v as Source)}
            class="h-8 rounded-[8px] px-3 transition-colors {source === v ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'}">{l}{#if n}<span class="ml-1.5 opacity-60">{n}</span>{/if}</button>
        {/each}
      </div>

      {#if source === "yours"}
        <section data-guide="programs-library" class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Your programs">
          {#each active as p (p.id)}
            {@const n = clientsOn(p.id)}
            <ActionMenu actions={rowActions(p)} label="More for {p.name}">
              {#snippet children({ props, more })}
                <article {...props} class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-4 first:border-t-0 data-[state=open]:bg-muted/40">
                  <button type="button" onclick={() => select(p.id)} class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5 text-left">
                    <span class="text-[15px] font-semibold">{p.name}</span>
                    {#if p.origin && (p.origin.name !== p.name || p.origin.author)}<span class="text-xs text-muted-foreground">From {p.origin.kind === "logit" ? "LogIt" : "the community"}{p.origin.name !== p.name ? `: ${p.origin.name}` : ""}{p.origin.author ? ` by ${p.origin.author}` : ""}</span>{/if}
                    <span class="text-[13px] text-muted-foreground">{P.programSummary(p)}</span>
                  </button>
                  <span class="text-[13px] tabular-nums {n ? '' : 'text-muted-foreground'}">{n} {n === 1 ? "client" : "clients"}</span>
                  {@render more()}
                </article>
              {/snippet}
            </ActionMenu>
          {:else}
            <p class="px-5 py-10 text-center text-[13px] text-muted-foreground">Nothing here yet. Start from one of LogIt's programs, or build your own.</p>
          {/each}
        </section>
        {#if archived.length}
          <Button variant="ghost" size="sm" class="self-start" onclick={() => (showArchived = !showArchived)}>{showArchived ? "Hide" : "Show"} archived · {archived.length}</Button>
          {#if showArchived}
            <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Archived programs">
              {#each archived as p (p.id)}
                <button type="button" onclick={() => select(p.id)} class="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-left text-[13px] text-muted-foreground first:border-t-0 hover:bg-muted/40">
                  <span>{p.name}</span><span class="text-xs">{P.programSummary(p)}</span>
                </button>
              {/each}
            </section>
          {/if}
        {/if}
      {:else}
        <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="{source === 'logit' ? 'LogIt' : 'Community'} programs">
          {#if source === "logit"}
            {#each logit as p (p.id)}
              <button type="button" onclick={() => { startTab = "logit"; startOpen = true; }} class="flex flex-col gap-0.5 border-t border-border px-5 py-4 text-left first:border-t-0 hover:bg-muted/40">
                <span class="text-[15px] font-semibold">{p.name}</span>
                <span class="text-[13px] text-muted-foreground">{P.programSummary(p)}</span>
              </button>
            {/each}
          {:else}
            {#each packs as e (e.id)}
              <button type="button" onclick={() => { startTab = "community"; startOpen = true; }} class="flex flex-col gap-0.5 border-t border-border px-5 py-4 text-left first:border-t-0 hover:bg-muted/40">
                <span class="text-[15px] font-semibold">{e.name}</span>
                <span class="text-[13px] text-muted-foreground">{e.author ? `by ${e.author} · ` : ""}{e.description}</span>
              </button>
            {:else}
              <p class="px-5 py-10 text-center text-[13px] text-muted-foreground">No program packs in the directory yet. Anyone with Pro can make one in Plugins › Build.</p>
            {/each}
          {/if}
        </section>
        <p class="text-xs text-muted-foreground">Read-only until you copy one. Copying makes it yours; a pack update never changes your copy or your clients'.</p>
      {/if}
      {/if}
    {/if}
  {/if}
</div>

<AssignProgramDialog bind:open={assignOpen} program={assignFor} onassigned={load} />
<StartFromProgramDialog bind:open={startOpen} bind:tab={startTab} yours={active} oncopy={copyIn} />
