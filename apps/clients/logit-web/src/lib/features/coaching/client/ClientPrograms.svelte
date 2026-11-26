<script lang="ts">
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type Sharing } from "@logit/core/api/coachApi";
  import { programSwaps, SWAP_RULES, SWAP_WHY_LABEL, swapRuleLabel, type ProgramSwap, type SwapRule } from "@logit/core/domain/swaps";
  import { loadWebLibrary } from "$lib/features/library/libraryData";
  import {
    archiveCoachProgram,
    copyProgramForClient,
    createCoachProgram,
    fromDateInputValue,
    getProgramStartMs,
    startOfLocalDayMs,
    toDateInputValue,
    type CoachProgram,
  } from "@logit/core/domain/CoachProgram";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { getWebCoachProgramRepo, getWebDeps } from "$lib/deps";
  import { programStatus, type ProgramStatus } from "../coachingData";
  import { shortDate, weekdayDate } from "../format";

  let { clientId, relationshipId, username, name, sharing, openAssign = false }: {
    clientId: string; relationshipId: string; username: string; name: string; sharing: Sharing; openAssign?: boolean;
  } = $props();

  const DAY = 86_400_000;
  let copies = $state<CoachProgram[]>([]);
  let library = $state<CoachProgram[]>([]);
  let sessions = $state<WorkoutSession[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let ending = $state<CoachProgram | null>(null);

  // Exercise swaps: your default, this client's own rule (null = your default), and the swaps
  // in their workouts from your programs over the last four weeks.
  let defaultRule = $state<SwapRule>("any");
  let clientRule = $state<SwapRule | null>(null);
  let savingRule = $state(false);
  let swaps = $state<ProgramSwap[]>([]);

  // Assign dialog
  // svelte-ignore state_referenced_locally
  let assignOpen = $state(openAssign);
  let pick = $state<string>("");
  let startMode = $state<"date" | "manual">("date");
  let startDate = $state(toDateInputValue(nextMonday()));
  let assigning = $state(false);

  function nextMonday(): number {
    const d = new Date(startOfLocalDayMs());
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.getTime();
  }

  async function load() {
    try {
      const repo = getWebCoachProgramRepo();
      const [mine, templates] = await Promise.all([repo.listMyPrograms({ recipientId: clientId }), repo.listMyPrograms({ templates: true })]);
      copies = mine.map((m) => m.program).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      library = templates.map((m) => m.program).filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name));
      if (!pick && library[0]) pick = library[0].id;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load programs";
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await load();
    void loadRules();
    if (sharing.workouts) {
      getWebDeps(clientId).workoutRepo.listAllSessions().then((s) => {
        sessions = s.filter((x) => x.endedAtMs != null);
        void loadSwaps();
      }).catch(() => {});
    }
  });

  async function loadRules() {
    try {
      const [settings, clients] = await Promise.all([coachApi.getCoachSettings(), coachApi.listClients()]);
      defaultRule = settings.swapRule;
      clientRule = clients.find((c) => c.relationshipId === relationshipId)?.swapRule ?? null;
    } catch {
      /* the card shows the default */
    }
  }

  async function loadSwaps() {
    const mine = new Set(copies.map((p) => p.id));
    const fromMyPrograms = sessions.filter((x) => x.source?.kind === "program" && mine.has(x.source.parentId));
    if (!fromMyPrograms.length) return;
    const library = await loadWebLibrary().then((l) => l.entries).catch(() => []);
    swaps = programSwaps(fromMyPrograms, library, { sinceMs: Date.now() - 28 * DAY });
  }

  async function setRule(value: string) {
    const next = value === "" ? null : (value as SwapRule);
    const before = clientRule;
    clientRule = next;
    savingRule = true;
    try {
      clientRule = (await coachApi.setClientSwapRule(relationshipId, next)).swapRule;
    } catch (e) {
      clientRule = before;
      toast.error(e instanceof Error ? e.message : "Couldn't save it");
    } finally {
      savingRule = false;
    }
  }

  const effectiveRule = $derived(clientRule ?? defaultRule);
  const RULE_NOTE: Record<SwapRule, string> = {
    any: "They can swap to anything; your alternatives show first.",
    muscles: "Your alternatives, plus exercises for the same main muscles.",
    list: "Exercises without alternatives can't be swapped; they'll see \"Ask to swap\".",
  };

  const statuses = $derived(copies.map((p) => ({ p, s: programStatus(p) })));
  const current = $derived(statuses.filter((x) => !x.p.archived && x.s.state !== "finished"));
  const past = $derived(statuses.filter((x) => x.p.archived || x.s.state === "finished"));
  // When the latest current program ends: a new one starting then follows straight on.
  const lastEnd = $derived(Math.max(0, ...current.map((x) => x.s.endsAtMs ?? 0)));

  /** Sessions done in each program week, when workouts are shared. */
  function weekBars(p: CoachProgram, s: ProgramStatus): { done: number; planned: number; now: boolean }[] {
    const start = getProgramStartMs(p);
    return p.weeks
      .slice()
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((w) => {
        const from = start == null ? 0 : start + (w.weekNumber - 1) * 7 * DAY;
        const done = start == null ? 0 : sessions.filter((x) => x.startedAtMs >= from && x.startedAtMs < from + 7 * DAY).length;
        return { done, planned: w.days.length, now: s.week === w.weekNumber };
      });
  }

  function startText(p: CoachProgram, s: ProgramStatus): string {
    const start = getProgramStartMs(p);
    if (s.state === "waiting") return "Waiting for them to tap Start";
    if (s.state === "scheduled") return `Starts ${weekdayDate(s.startsAtMs!)}`;
    const how = p.startMode === "fixed-date" ? "" : " (they tapped Start)";
    const ends = s.endsAtMs ? ` · ends ${shortDate(s.endsAtMs - DAY)}` : "";
    return `Started ${start ? weekdayDate(start) : ""}${how} · week ${s.week} of ${s.totalWeeks}${ends}`;
  }

  async function assign() {
    assigning = true;
    try {
      const repo = getWebCoachProgramRepo();
      const start = startMode === "manual"
        ? ({ mode: "manual" } as const)
        : ({ mode: "fixed-date", startDateMs: fromDateInputValue(startDate) ?? startOfLocalDayMs() } as const);
      let program: CoachProgram;
      if (pick === "__blank") {
        program = createCoachProgram(`${name}'s program`);
      } else {
        const template = library.find((p) => p.id === pick);
        if (!template) return;
        program = copyProgramForClient(template, start);
      }
      await repo.saveProgram(program, username);
      assignOpen = false;
      if (pick === "__blank") {
        await goto(`/clients/${clientId}/programs/${program.id}?u=${username}`);
        return;
      }
      toast.success(`${program.name} assigned to ${name}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't assign");
    } finally {
      assigning = false;
    }
  }

  async function endProgram() {
    const p = ending;
    ending = null;
    if (!p) return;
    try {
      await getWebCoachProgramRepo().saveProgram(archiveCoachProgram(p), username);
      toast.success(`${p.name} ended`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't end it");
    }
  }

  export function openAssignDialog() {
    if (lastEnd) startDate = toDateInputValue(startOfLocalDayMs(lastEnd));
    assignOpen = true;
  }
</script>

{#if error}
  <p class="text-sm text-destructive">{error}</p>
{:else if loading}
  <Skeleton class="h-56" />
{:else}
  <div class="flex flex-wrap items-start gap-4">
    <div class="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
      {#each current as { p, s } (p.id)}
        <section class="flex flex-col gap-3.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
          <div class="flex flex-wrap justify-between gap-2.5">
            <div>
              <h2 class="text-[17px] font-bold">{p.name} <span class="text-xs font-normal text-muted-foreground">· their copy</span></h2>
              <p class="mt-0.5 text-xs text-muted-foreground">{startText(p, s)}</p>
            </div>
            <span class="flex gap-2">
              <a href="/clients/{clientId}/programs/{p.id}?u={username}" class="h-[30px] rounded-lg border border-border px-2.5 text-xs font-medium leading-[30px] hover:bg-muted">Edit their copy</a>
              <button type="button" onclick={() => (ending = p)} class="h-[30px] rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">End program</button>
            </span>
          </div>
          {#if sharing.workouts && s.state === "running"}
            {@const bars = weekBars(p, s)}
            <div class="flex gap-2" role="img" aria-label="Sessions done per week: {bars.map((b, i) => `week ${i + 1} ${b.done} of ${b.planned}`).join(', ')}">
              {#each bars as b, i (i)}
                <div class="flex flex-1 flex-col items-center gap-1 text-[11px] {b.now ? 'text-foreground' : 'text-muted-foreground'}">
                  <div class="h-2 w-full overflow-hidden rounded bg-muted">
                    {#if (s.week ?? 0) >= i + 1}<div class="h-full {b.now ? 'bg-primary' : b.done >= b.planned ? 'bg-success' : 'bg-warning'}" style="width: {b.planned ? Math.min(100, (b.done / b.planned) * 100) : 0}%"></div>{/if}
                  </div>
                  W{i + 1}{(s.week ?? 0) >= i + 1 ? ` · ${b.done}/${b.planned}` : ""}
                </div>
              {/each}
            </div>
          {/if}
          {#if p.sourceProgramId}
            {@const src = library.find((l) => l.id === p.sourceProgramId)}
            {#if src}<p class="text-xs text-muted-foreground">Copied from your library's "{src.name}". <a href="/coaching/programs?id={src.id}" class="underline hover:text-foreground">Open the library version</a></p>{/if}
          {/if}
        </section>
      {:else}
        <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
          <h2 class="text-sm font-semibold">No program from you</h2>
          <p class="text-[13px] text-muted-foreground">{name} is training on their own plan. Assign one from your library and they'll see it on their phone.</p>
          <button type="button" onclick={openAssignDialog} class="h-8 w-fit rounded-[9px] bg-primary px-3 text-xs font-semibold text-primary-foreground">Assign program</button>
        </section>
      {/each}

      {#if sharing.workouts && current.length}
        <section class="flex flex-col rounded-[10px] border border-border bg-card px-1.5 py-2">
          <div class="flex items-baseline justify-between px-3 pb-1 pt-2"><h2 class="text-sm font-semibold">Swaps in their workouts</h2><span class="text-xs text-muted-foreground">Last 4 weeks · {swaps.length}</span></div>
          {#if swaps.length}
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-[13px]">
                <thead><tr class="text-left text-xs text-muted-foreground"><th class="px-3 py-2 font-medium">Date</th><th class="px-3 py-2 font-medium">Planned</th><th class="px-3 py-2 font-medium">Did instead</th><th class="px-3 py-2 font-medium">Why it was allowed</th></tr></thead>
                <tbody>
                  {#each swaps as w, i (w.sessionId + i)}
                    <tr class="border-t border-border align-top"><td class="px-3 py-2.5">{weekdayDate(w.startedAtMs)}</td><td class="px-3 py-2.5">{w.planned}</td><td class="px-3 py-2.5 font-semibold">{w.didInstead}</td><td class="px-3 py-2.5 text-muted-foreground">{SWAP_WHY_LABEL[w.why]}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="px-3 pb-2 text-[13px] text-muted-foreground">No swaps. {name} did every exercise as planned.</p>
          {/if}
        </section>
      {/if}
    </div>

    <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
    <section class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="text-sm font-semibold">Exercise swaps for {name}</h2>
      <label for="swap-rule" class="text-xs font-medium text-muted-foreground">During workouts from your programs</label>
      <NativeSelect.Root id="swap-rule" disabled={savingRule} value={clientRule ?? ""} onchange={(e) => setRule(e.currentTarget.value)}
        class="h-9 rounded-[9px] border border-input bg-background px-2 text-[13px]">
        <NativeSelect.Option value="">Your default: {swapRuleLabel(defaultRule)}</NativeSelect.Option>
        {#each SWAP_RULES as r (r.key)}<NativeSelect.Option value={r.key}>{r.label}</NativeSelect.Option>{/each}
      </NativeSelect.Root>
      <p class="text-xs leading-relaxed text-muted-foreground">{clientRule ? "Set differently from your default. " : ""}{RULE_NOTE[effectiveRule]}</p>
      {#if clientRule}<button type="button" disabled={savingRule} onclick={() => setRule("")} class="w-fit text-xs text-muted-foreground underline hover:text-foreground">Back to your default</button>{/if}
    </section>

    <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="pb-1.5 text-sm font-semibold">Finished or ended</h2>
      {#each past as { p } (p.id)}
        <a href="/clients/{clientId}/programs/{p.id}?u={username}" class="flex justify-between gap-3 border-t border-border py-2.5 text-[13px] hover:opacity-80">
          <span>{p.name}</span><span class="text-xs text-muted-foreground">{p.weeks.length} week{p.weeks.length === 1 ? "" : "s"}{p.archived ? " · ended" : ""}</span>
        </a>
      {:else}
        <p class="border-t border-border py-2.5 text-[13px] text-muted-foreground">None yet.</p>
      {/each}
    </section>
    </div>
  </div>
{/if}

<Dialog.Root bind:open={assignOpen}>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-[520px]">
    <Dialog.Header>
      <Dialog.Title>Assign a program to {name}</Dialog.Title>
      <Dialog.Description>They get their own copy, which you can change for them without touching your library.</Dialog.Description>
    </Dialog.Header>
    <fieldset class="flex flex-col gap-1.5">
      <legend class="pb-1.5 text-xs font-medium text-muted-foreground">From your library</legend>
      {#each library as t (t.id)}
        {@const now = current.some((x) => x.p.sourceProgramId === t.id)}
        {@const before = !now && copies.some((c) => c.sourceProgramId === t.id)}
        {@const d = t.weeks[0]?.days.length ?? 0}
        <label class="flex cursor-pointer items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] {pick === t.id ? 'border-primary bg-muted' : 'border-border'}">
          <input type="radio" name="pick" value={t.id} bind:group={pick} class="mt-0.5" />
          <span><span class="block font-semibold">{t.name}</span><span class="text-xs text-muted-foreground">{t.weeks.length} week{t.weeks.length === 1 ? "" : "s"} · {d} day{d === 1 ? "" : "s"}{now ? ` · ${name} is on this now` : before ? ` · ${name} has had this before` : ""}</span></span>
        </label>
      {:else}
        <p class="text-[13px] text-muted-foreground">Your library is empty. <a href="/coaching/programs" class="text-primary hover:underline">Build a program</a> to reuse it, or start one just for {name}:</p>
      {/each}
      <label class="flex cursor-pointer items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] {pick === '__blank' ? 'border-primary bg-muted' : 'border-border'}">
        <input type="radio" name="pick" value="__blank" bind:group={pick} class="mt-0.5" />
        <span><span class="block font-semibold">Start from scratch</span><span class="text-xs text-muted-foreground">A new program just for {name}</span></span>
      </label>
    </fieldset>
    {#if pick !== "__blank"}
      <fieldset class="flex flex-col gap-1.5">
        <legend class="pb-1.5 text-xs font-medium text-muted-foreground">Starts</legend>
        <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2 text-[13px] {startMode === 'date' ? 'border-primary bg-muted' : 'border-border'}">
          <input type="radio" name="start" value="date" bind:group={startMode} />
          <span class="flex-1">On a date</span>
          <input type="date" bind:value={startDate} aria-label="Start date" disabled={startMode !== "date"} class="h-8 rounded-md border border-input bg-background px-2 text-[13px]" />
        </label>
        <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] {startMode === 'manual' ? 'border-primary bg-muted' : 'border-border'}">
          <input type="radio" name="start" value="manual" bind:group={startMode} />
          <span>When they tap Start on their phone</span>
        </label>
      </fieldset>
      {#if lastEnd}<p class="text-xs text-muted-foreground">Their current program ends {weekdayDate(lastEnd - DAY)}. Starting on {weekdayDate(lastEnd)} follows straight on.</p>{/if}
      <p class="text-xs text-muted-foreground">Percent loads turn into kilos from {name}'s own lifts.</p>
    {/if}
    <Dialog.Footer>
      <button type="button" onclick={() => (assignOpen = false)} class="h-9 rounded-[9px] border border-border px-3.5 text-[13px] hover:bg-muted">Cancel</button>
      <button type="button" disabled={assigning || !pick} onclick={assign} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{pick === "__blank" ? "Create" : "Assign"}</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={ending !== null} onOpenChange={(o) => { if (!o) ending = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>End {ending?.name}?</AlertDialog.Title>
      <AlertDialog.Description>It leaves {name}'s phone. Workouts they already logged stay.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={endProgram}>End program</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
