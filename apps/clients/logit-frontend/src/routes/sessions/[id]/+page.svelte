<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    Share2,
    MoreHorizontal,
    Pencil,
    RotateCcw,
    Trophy,
    ClipboardList,
    ChevronRight,
    Link2,
    Activity,
    Copy,
    EyeOff,
    Trash2,
  } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import { toast } from "$lib/components/ui/sonner/index";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { bottomNavHeight } from "$lib/stores/bottomNav.store";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { deleteSession } from "$lib/usecases/deleteSession";
  import { editSession, saveSessionDetails } from "$lib/usecases/editSession";
  import { sessionHistory } from "$lib/features/sessions/history";
  import PlanSheet from "$lib/features/sessions/PlanSheet.svelte";
  import SaveAsSplitDaySheet from "$lib/features/sessions/SaveAsSplitDaySheet.svelte";
  import SessionEditor from "$lib/features/sessions/SessionEditor.svelte";
  import {
    changeClass,
    changeLabel,
    dayLabel,
    durationLabel,
    longDayLabel,
    planRowDetail,
    timeLabel,
    volumeLabel,
  } from "$lib/features/sessions/format";
  import {
    comparePlan,
    previousSameWorkout,
    type PlanRow,
  } from "@logit/core/domain/sessionHistory";
  import {
    blockGroup,
    groupLabel,
    isContinuationSet,
    mobilitySetGroups,
    setSessionName,
    setSessionNote,
    setTypeMeta,
    type CardioBlockData,
    type MobilityBlockData,
    type MobilitySet,
    type SessionBlock,
    type StrengthBlockData,
    type WorkoutSession,
  } from "@logit/core/domain/workout";
  import { formatLoad, formatWeight } from "@logit/core/domain/units";
  import { usesBodyweightLoad } from "@logit/core/domain/exercise";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);
  const unit = $derived($profile.weightUnit);

  let loaded = $state(false);
  onMount(() => {
    sessionHistory.refresh().finally(() => (loaded = true));
  });

  const history = $derived($sessionHistory);
  const entry = $derived(history?.byId.get(id) ?? null);
  const session = $derived(entry?.session ?? null);

  // ── What it says ────────────────────────────────────────────────────────
  const blocks = $derived(session ? [...session.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : []);
  const plan = $derived(session ? comparePlan(session) : null);
  const planByBlock = $derived(new Map((plan?.rows ?? []).filter((r) => r.block).map((r) => [r.block!.id, r])));

  const previous = $derived.by(() => {
    if (!session || !history) return null;
    const titleOf = (s: WorkoutSession) => history.byId.get(s.id)?.title ?? "";
    const p = previousSameWorkout(session, history.entries.map((e) => e.session), titleOf);
    return p ? history.byId.get(p.id) ?? null : null;
  });

  const vsLast = $derived.by(() => {
    if (!entry || !previous || !session?.endedAtMs || !previous.session.endedAtMs) return null;
    const dv = entry.volumeKg - previous.volumeKg;
    const dt = (session.endedAtMs - session.startedAtMs) - (previous.session.endedAtMs - previous.session.startedAtMs);
    const mins = Math.round(Math.abs(dt) / 60_000);
    return {
      volume: Math.abs(dv) >= 1 ? `${dv > 0 ? "+" : "−"}${volumeLabel(Math.abs(dv), unit)}` : null,
      up: dv > 0,
      time: mins >= 1 ? `${mins} min ${dt < 0 ? "quicker" : "longer"}` : null,
      what: `${previous.title} (${dayLabel(previous.session.startedAtMs)})`,
    };
  });

  /** For each PR'd exercise, the set that did it. */
  const prSetIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const pr of entry?.prs ?? []) {
      const b = session?.blocks.find((x) => x.id === pr.blockId);
      const set = (b?.data as StrengthBlockData | undefined)?.sets.find((s) => s.weight === pr.weight && s.reps === pr.reps);
      if (set) ids.add(set.id);
    }
    return ids;
  });

  // Runs of blocks in one group fold into one card.
  type Item = { kind: "single"; block: SessionBlock } | { kind: "group"; id: string; label: string; blocks: SessionBlock[] };
  const items = $derived.by((): Item[] => {
    const out: Item[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const g = blockGroup(blocks[i]!);
      if (!g) {
        out.push({ kind: "single", block: blocks[i]! });
        continue;
      }
      const members: SessionBlock[] = [];
      while (i < blocks.length && blockGroup(blocks[i]!)?.id === g.id) members.push(blocks[i++]!);
      i--;
      out.push({ kind: "group", id: g.id, label: groupLabel(members.length, g.label, g.kind), blocks: members });
    }
    return out;
  });

  function bodyweightOf(d: StrengthBlockData): boolean {
    return usesBodyweightLoad(d.exerciseId ? history?.volumeCtx?.typeById.get(d.exerciseId) : undefined, d.sets.map((s) => s.weight));
  }

  function logged(d: StrengthBlockData) {
    return [...d.sets].sort((a, b) => a.orderIndex - b.orderIndex).filter((s) => s.reps > 0 || s.completed);
  }

  function planLine(row: PlanRow | undefined, metric: "hold" | "reps" | null = null): { text: string; warn: boolean } | null {
    if (!row || row.status === "skipped") return null;
    const sets = (row.item.sets ?? []).filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType));
    let planned = "";
    if (row.item.type === "strength" && sets.length) {
      const r = sets[0]!;
      const reps = r.repsMax ? `${r.reps}–${r.repsMax}` : `${r.reps}`;
      const w = Math.max(...sets.map((s) => s.weight));
      planned = `${sets.length} × ${reps}${w > 0 ? ` · ${formatWeight(w, unit)}` : ""}`;
    } else if (row.item.type === "mobility") {
      planned = `${row.item.rounds ?? 1} × ${row.item.targetSec ? `${row.item.targetSec} s` : row.item.targetReps ?? ""}`.trim();
    }
    if (row.status === "swapped") return { text: `Swapped in for ${row.item.name}`, warn: false };
    const detail = planRowDetail(row, unit, metric);
    if (row.status === "under") return { text: `Plan was ${planned}: ${detail}`, warn: true };
    if (row.status === "beat") return { text: `Plan ${planned} · ${detail}`, warn: false };
    return planned ? { text: `Plan ${planned} · done`, warn: false } : null;
  }

  function fmtHold(s: number): string {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
  }
  function mobValue(s: MobilitySet | undefined, metric: "hold" | "reps"): string {
    if (!s) return "–";
    const v = metric === "hold" ? (s.durationSec ? fmtHold(s.durationSec) : "–") : s.reps != null ? `${s.reps}` : "–";
    return s.loadKg ? `${v} · ${formatWeight(s.loadKg, unit)}` : v;
  }

  function cardioSummary(d: CardioBlockData): string {
    const ms = d.intervals.reduce((n, iv) => n + (iv.durationMs ?? 0), 0);
    const m = d.intervals.reduce((n, iv) => n + (iv.distanceM ?? 0), 0);
    const parts: string[] = [];
    if (ms > 0) parts.push(durationLabel(ms));
    if (m > 0) parts.push(unit === "lbs" ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`);
    return parts.join(" · ") || "Nothing logged";
  }

  const autoTitle = $derived(entry?.autoTitle ?? "Workout");

  // ── Sheets and actions ──────────────────────────────────────────────────
  let planOpen = $state(false);
  let saveAsOpen = $state(false);
  let saveAsReplace = $state<string | null>(null);
  let sharing = $state(false);
  let renameOpen = $state(false);
  let renameValue = $state("");
  let confirmDelete = $state(false);
  let confirmReplace = $state(false);
  let busy = $state(false);

  const parentSplit = $derived(
    session?.source?.kind === "split" ? history?.splits.find((s) => s.id === session.source!.parentId) ?? null : null,
  );
  const currentDay = $derived(
    session?.source?.kind !== "split" ? undefined : parentSplit ? parentSplit.days.find((d) => d.id === session.source!.dayId) ?? null : null,
  );

  async function reload() {
    await sessionHistory.refresh();
  }

  async function rename() {
    if (!session) return;
    busy = true;
    try {
      await saveSessionDetails(setSessionName(session, renameValue));
      await reload();
      renameOpen = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rename it");
    } finally {
      busy = false;
    }
  }

  async function toggleExclude() {
    if (!session) return;
    busy = true;
    try {
      const next = { ...session, excludeFromProgression: session.excludeFromProgression ? undefined : true };
      await editSession(next, session);
      await reload();
      toast.success(next.excludeFromProgression ? "Left out of progression" : "Counts for progression again");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      busy = false;
    }
  }

  async function doAgain(replace = false) {
    if (!session || busy) return;
    if ($currentSession && !replace) {
      confirmReplace = true;
      return;
    }
    busy = true;
    try {
      const running = $currentSession;
      if (running) {
        const repo = getWorkoutRepo();
        await repo.clearDraftSession();
        await repo.deleteSession(running.id);
      }
      await currentSession.repeat(session);
      await goto("/session/current");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start it");
    } finally {
      busy = false;
    }
  }

  async function remove() {
    busy = true;
    try {
      await deleteSession(id);
      void reload();
      back("/sessions");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete it");
      busy = false;
    }
  }

  // ── Editing ─────────────────────────────────────────────────────────────
  let draft = $state<WorkoutSession | null>(null);
  let confirmDiscard = $state(false);
  const editing = $derived(draft !== null);
  const changed = $derived(!!draft && !!session && JSON.stringify(draft) !== JSON.stringify(session));

  function startEditing() {
    if (session) draft = structuredClone($state.snapshot(session)) as WorkoutSession;
  }

  function stopEditing(force = false) {
    if (changed && !force) {
      confirmDiscard = true;
      return;
    }
    draft = null;
  }

  async function saveEdit() {
    if (!draft || !session) return;
    const next = setSessionNote(setSessionName(draft, draft.name ?? null), draft.note ?? null);
    if (next.endedAtMs != null && next.endedAtMs <= next.startedAtMs) {
      toast.error("It has to end after it starts.");
      return;
    }
    busy = true;
    try {
      await editSession(next, session);
      await reload();
      draft = null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the changes");
    } finally {
      busy = false;
    }
  }
</script>

<PageHeader>
  {#if editing}
    <button type="button" class="h-11 shrink-0 px-2 text-sm text-muted-foreground" disabled={busy} onclick={() => stopEditing()}>Cancel</button>
    <h1 class="page-title text-center">Edit session</h1>
    <Button size="sm" class="shrink-0" disabled={busy || !changed} onclick={() => void saveEdit()}>{busy ? "Saving…" : "Save"}</Button>
  {:else}
    <BackButton onclick={() => back("/sessions")} />
    <h1 class="page-title">Session</h1>
    {#if authStore.isAuthenticated && session}
      <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" aria-label="Share session" onclick={() => (sharing = true)}>
        <Share2 class="h-[17px] w-[17px]" />
      </button>
    {/if}
    {#if session}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" aria-label="More actions">
          <MoreHorizontal class="h-5 w-5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-64">
          <DropdownMenu.Item onSelect={() => void doAgain()}><RotateCcw /> Do this again</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={startEditing}><Pencil /> Edit workout</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => { renameValue = session?.name ?? ""; renameOpen = true; }}><Pencil /> Rename</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => { saveAsReplace = null; saveAsOpen = true; }}><Copy /> Save as a split day…</DropdownMenu.Item>
          {#if authStore.isAuthenticated}
            <DropdownMenu.Item onSelect={() => (sharing = true)}><Share2 /> Share as a post</DropdownMenu.Item>
          {/if}
          <div class="my-1 h-px bg-border" role="separator"></div>
          <DropdownMenu.Item onSelect={() => void toggleExclude()} class="h-auto min-h-11 py-1.5">
            <EyeOff />
            <span class="flex flex-col">
              <span>{session.excludeFromProgression ? "Count for progression" : "Leave out of progression"}</span>
              <span class="text-[11px] text-muted-foreground">{session.excludeFromProgression ? "It's left out now" : "Won't change future weights"}</span>
            </span>
          </DropdownMenu.Item>
          <div class="my-1 h-px bg-border" role="separator"></div>
          <DropdownMenu.Item variant="destructive" onSelect={() => (confirmDelete = true)}><Trash2 /> Delete session</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  {/if}
</PageHeader>

<div class="flex flex-col gap-3 p-3 {editing ? 'pb-24' : 'pb-40'}">
  {#if !session}
    <p class="py-6 text-center text-sm text-muted-foreground">{loaded || history ? "Session not found." : "Loading…"}</p>
  {:else if editing && draft}
    <SessionEditor
      bind:draft
      {autoTitle}
      comparison={entry?.comparison}
      {unit}
      volumeCtx={history?.volumeCtx ?? null}
      saving={busy}
      onDelete={remove}
    />
  {:else if entry}
    <!-- Hero -->
    <section class="flex flex-col gap-3 rounded-xl border bg-card px-3.5 pt-3.5 pb-3">
      <div class="flex items-start gap-1.5">
        <div class="min-w-0 flex-1">
          <h2 class="text-[22px] font-bold leading-tight tracking-tight">{entry.title}</h2>
          <p class="mt-0.5 text-[13px] text-muted-foreground">
            {`${longDayLabel(session.startedAtMs)} · ${timeLabel(session.startedAtMs)}${session.endedAtMs ? ` – ${timeLabel(session.endedAtMs)}` : ""}`}
          </p>
        </div>
        <button
          type="button"
          class="-mt-1.5 -mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Rename session"
          onclick={() => { renameValue = session?.name ?? ""; renameOpen = true; }}
        >
          <Pencil class="h-4 w-4" />
        </button>
      </div>

      {#if session.source}
        {@const src = session.source}
        <button
          type="button"
          class="flex items-center gap-2.5 rounded-lg bg-muted px-2.5 py-2 text-left disabled:cursor-default"
          disabled={!plan}
          onclick={() => (planOpen = true)}
        >
          <ClipboardList class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-[13px] font-medium">{src.parentName}{src.dayNumber ? ` · Day ${src.dayNumber}` : ""}</span>
            {#if plan}
              <span class="text-xs text-muted-foreground">Followed the plan on {plan.followed} of {plan.rows.length}</span>
            {/if}
          </span>
          {#if plan}<span class="shrink-0 text-xs font-medium text-info">See plan</span>{/if}
        </button>
      {:else if entry.parentName}
        <p class="text-xs text-muted-foreground">Looks like {entry.title} from {entry.parentName}</p>
      {/if}

      <div class="grid grid-cols-4 text-center">
        <div class="px-0.5">
          <p class="text-base font-semibold tabular-nums">{session.endedAtMs ? durationLabel(session.endedAtMs - session.startedAtMs).replace(" min", "m").replace(" h ", "h ") : "–"}</p>
          <p class="text-[11px] text-muted-foreground">Time</p>
        </div>
        <div class="border-l border-border px-0.5">
          <p class="text-base font-semibold tabular-nums">{entry.setCount}</p>
          <p class="text-[11px] text-muted-foreground">Sets</p>
        </div>
        <div class="border-l border-border px-0.5">
          <p class="text-base font-semibold tabular-nums">{entry.volumeKg > 0 ? volumeLabel(entry.volumeKg, unit).replace(` ${unit}`, "") : "–"}</p>
          <p class="text-[11px] text-muted-foreground">{unit} lifted</p>
        </div>
        <div class="border-l border-border px-0.5">
          <p class="text-base font-semibold tabular-nums {entry.prs.length ? 'text-highlight' : ''}">{entry.prs.length}</p>
          <p class="text-[11px] text-muted-foreground">PRs</p>
        </div>
      </div>

      {#if vsLast && (vsLast.volume || vsLast.time)}
        <p class="border-t border-border pt-2.5 text-xs text-muted-foreground">
          {#if vsLast.volume}<span class="font-semibold {vsLast.up ? 'text-success' : 'text-warning'}">{vsLast.volume}</span>{/if}{vsLast.volume && vsLast.time ? ` and ${vsLast.time}` : vsLast.time ?? ""}{` than last ${vsLast.what}`}
        </p>
      {/if}
      {#if session.excludeFromProgression}
        <p class="flex items-center gap-1.5 text-xs text-warning"><EyeOff class="h-3.5 w-3.5" /> Left out of progression</p>
      {/if}
    </section>

    {#if session.note}
      <section class="rounded-xl border bg-card px-3.5 py-2.5">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
        <p class="mt-1 whitespace-pre-wrap text-sm">{session.note}</p>
      </section>
    {/if}

    {#if entry.prs.length}
      <section class="flex flex-col gap-2 rounded-xl border border-highlight-fill/50 bg-highlight-fill/10 px-3.5 py-2.5">
        {#each entry.prs as pr (pr.blockId)}
          <div class="flex items-center gap-2.5">
            <Trophy class="h-[18px] w-[18px] shrink-0 text-highlight" />
            <div class="min-w-0">
              <p class="text-sm font-semibold">{pr.exerciseName} {formatWeight(pr.weight, unit)} × {pr.reps}</p>
              <p class="text-xs text-highlight">
                {pr.kind === "weight" ? `Heaviest yet. Estimated 1RM ${formatWeight(Math.round(estimated1RM(pr.weight, pr.reps)), unit)}` : `Most reps at ${formatWeight(pr.weight, unit)}`}
              </p>
            </div>
          </div>
        {/each}
      </section>
    {/if}

    {#each items as item (item.kind === "group" ? item.id : item.block.id)}
      {#if item.kind === "group"}
        <section class="overflow-hidden rounded-xl border bg-card">
          <div class="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3.5 py-2">
            <Link2 class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</span>
          </div>
          {#each item.blocks as b, i (b.id)}
            {@const change = entry.comparison?.byBlockId[b.id]}
            <a
              href={b.type === "strength" && (b.data as StrengthBlockData).exerciseId ? `/exercises/${(b.data as StrengthBlockData).exerciseId}` : undefined}
              class="flex items-center gap-2 px-3.5 py-2.5 {i > 0 ? 'border-t border-border/60' : ''}"
            >
              <span class="min-w-0 flex-1">
                {#if b.type === "strength"}
                  {@const d = b.data as StrengthBlockData}
                  <span class="block truncate text-[15px] font-semibold">{d.exerciseName}</span>
                  <span class="mt-0.5 block truncate text-[13px] tabular-nums">
                    {logged(d).map((s) => `${formatLoad(s.weight, unit, bodyweightOf(d), { withUnit: false })} × ${s.reps}`).join(" · ") || "Nothing logged"}
                  </span>
                {:else if b.type === "mobility"}
                  {@const d = b.data as MobilityBlockData}
                  <span class="block truncate text-[15px] font-semibold">{d.drillName}</span>
                  <span class="mt-0.5 block truncate text-[13px] tabular-nums">
                    {mobilitySetGroups(d).map((g) => (g.kind === "single" ? mobValue(g.set, d.metric) : `${mobValue(g.left, d.metric)}/${mobValue(g.right, d.metric)}`)).join(" · ")}
                  </span>
                {:else if b.type === "cardio"}
                  <span class="block truncate text-[15px] font-semibold">{(b.data as CardioBlockData).activityName}</span>
                  <span class="mt-0.5 block text-[13px]">{cardioSummary(b.data as CardioBlockData)}</span>
                {/if}
              </span>
              {#if change && change.kind !== "new"}
                <span class="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold {changeClass(change.kind)}">
                  {changeLabel(change, unit, b.type === "mobility" ? (b.data as MobilityBlockData).metric : null)}
                </span>
              {/if}
            </a>
          {/each}
        </section>
      {:else}
        {@const b = item.block}
        {@const change = entry.comparison?.byBlockId[b.id]}
        {#if b.type === "strength"}
          {@const d = b.data as StrengthBlockData}
          {@const sets = logged(d)}
          {@const bw = bodyweightOf(d)}
          {@const line = planLine(planByBlock.get(b.id))}
          {@const prev = change?.previousSets ?? []}
          <section class="overflow-hidden rounded-xl border bg-card">
            <a href={d.exerciseId ? `/exercises/${d.exerciseId}` : undefined} class="flex items-center gap-2 px-3.5 py-2.5">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-semibold">{d.exerciseName}</span>
                {#if line}
                  <span class="mt-0.5 block text-xs {line.warn ? 'text-warning' : 'text-muted-foreground'}">{line.text}</span>
                {/if}
              </span>
              {#if change && change.kind !== "new"}
                <span class="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold {changeClass(change.kind)}">{changeLabel(change, unit)}</span>
              {:else if change?.kind === "new"}
                <span class="shrink-0 text-xs text-muted-foreground">First time</span>
              {/if}
              {#if d.exerciseId}<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />{/if}
            </a>
            {#if sets.length}
              <div class="grid grid-cols-[2.25rem_1fr_1fr_1.3fr] gap-1 border-t border-border px-3.5 py-1.5 text-[11px] text-muted-foreground">
                <span>Set</span><span>{unit}</span><span>Reps</span><span class="text-right">Last time</span>
              </div>
              {#each sets as s, i (s.id)}
                {@const meta = setTypeMeta(s.setType)}
                {@const p = prev[i]}
                <div class="grid grid-cols-[2.25rem_1fr_1fr_1.3fr] items-center gap-1 border-t border-border/50 px-3.5 py-1.5 text-sm tabular-nums">
                  <span>
                    {#if meta.short}
                      <span class="rounded-md border px-1 py-0.5 text-[10px] font-bold {meta.badgeClass}" title={meta.label}>{meta.short}</span>
                    {:else}
                      <span class="text-xs text-muted-foreground">{sets.filter((x, j) => j <= i && !setTypeMeta(x.setType).short).length}</span>
                    {/if}
                  </span>
                  <span class="flex items-center gap-1.5 font-medium">
                    {formatLoad(s.weight, unit, bw, { withUnit: false })}
                    {#if prSetIds.has(s.id)}<span class="rounded border border-highlight-fill/60 bg-highlight-fill/15 px-1 text-[10px] font-bold text-highlight">PR</span>{/if}
                  </span>
                  <span>{s.reps}{#if s.rpe != null}<span class="text-xs text-muted-foreground"> @{s.rpe}</span>{/if}</span>
                  <span class="text-right text-xs text-muted-foreground">{p ? `${formatLoad(p.weight, unit, bw, { withUnit: false })} × ${p.reps}` : ""}</span>
                </div>
              {/each}
            {:else}
              <p class="border-t border-border/50 px-3.5 py-2 text-xs text-muted-foreground">Nothing logged</p>
            {/if}
          </section>
        {:else if b.type === "mobility"}
          {@const d = b.data as MobilityBlockData}
          {@const line = planLine(planByBlock.get(b.id), d.metric)}
          <section class="overflow-hidden rounded-xl border bg-card">
            <div class="flex items-center gap-2 px-3.5 py-2.5">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-semibold">{d.drillName}</span>
                <span class="mt-0.5 block text-xs {line?.warn ? 'text-warning' : 'text-muted-foreground'}">
                  {line ? line.text : `${d.metric === "hold" ? "Hold" : "Reps"}${d.perSide ? " · each side" : ""}`}
                </span>
              </span>
              {#if change && change.kind !== "new"}
                <span class="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold {changeClass(change.kind)}">{changeLabel(change, unit, d.metric)}</span>
              {/if}
            </div>
            {#each mobilitySetGroups(d) as g (g.setNumber)}
              <div class="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 border-t border-border/50 px-3.5 py-1.5 text-sm tabular-nums">
                <span class="text-xs text-muted-foreground">{g.setNumber}</span>
                {#if g.kind === "single"}
                  <span>{mobValue(g.set, d.metric)}{#if g.set.depth}<span class="text-xs text-muted-foreground"> · depth {g.set.depth}</span>{/if}</span>
                {:else}
                  <span>L {mobValue(g.left, d.metric)}</span>
                  <span>R {mobValue(g.right, d.metric)}</span>
                {/if}
              </div>
            {/each}
          </section>
        {:else if b.type === "cardio"}
          {@const d = b.data as CardioBlockData}
          <section class="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5">
            <Activity class="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-semibold">{d.activityName}</span>
              <span class="mt-0.5 block text-[13px]">{cardioSummary(d)}</span>
            </span>
          </section>
        {/if}
      {/if}
    {:else}
      <p class="py-6 text-center text-sm text-muted-foreground">Nothing was logged in this workout.</p>
    {/each}
  {/if}
</div>

{#if session && !editing}
  <div class="fixed inset-x-0 z-10 flex gap-2 border-t border-border bg-background px-3 py-3" style="bottom: {$bottomNavHeight}px">
    <Button variant="outline" class="h-11 flex-1 gap-2" disabled={busy} onclick={startEditing}>
      <Pencil class="h-4 w-4" /> Edit
    </Button>
    <Button class="h-11 flex-[1.6] gap-2" disabled={busy} onclick={() => void doAgain()}>
      <RotateCcw class="h-4 w-4" /> Do this again
    </Button>
  </div>
{/if}

{#if session?.source && plan}
  <PlanSheet
    open={planOpen}
    {session}
    {currentDay}
    {unit}
    onOpenChange={(v) => (planOpen = v)}
    onOpenParent={parentSplit ? () => { planOpen = false; void goto(`/splits/${parentSplit.id}`); } : undefined}
    onMatchDay={currentDay ? () => { planOpen = false; saveAsReplace = currentDay.id; setTimeout(() => (saveAsOpen = true), 150); } : undefined}
  />
{/if}

{#if session && history}
  <SaveAsSplitDaySheet
    open={saveAsOpen}
    {session}
    title={entry?.title ?? "Workout"}
    splits={history.splits}
    activeSplitId={$activeSplit?.id ?? null}
    replaceDayId={saveAsReplace}
    onOpenChange={(v) => (saveAsOpen = v)}
    onSaved={() => { void reload(); void activeSplit.load(); }}
  />
{/if}

<Dialog.Root open={renameOpen} onOpenChange={(v) => (renameOpen = v)}>
  <Dialog.Content class="sm:max-w-[400px]">
    <Dialog.Header class="text-left">
      <Dialog.Title>Rename</Dialog.Title>
      <Dialog.Description>Leave it empty to go back to {autoTitle}.</Dialog.Description>
    </Dialog.Header>
    <form class="flex flex-col gap-3" onsubmit={(e) => { e.preventDefault(); void rename(); }}>
      <input
        type="text"
        aria-label="Session name"
        class="h-11 w-full rounded-md border border-border bg-background px-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder={autoTitle}
        bind:value={renameValue}
      />
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" onclick={() => (renameOpen = false)}>Cancel</Button>
        <Button type="submit" disabled={busy}>Save</Button>
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>

<ConfirmDialog
  open={confirmDelete}
  onOpenChange={(v) => (confirmDelete = v)}
  title="Delete this session?"
  description="It's removed for good, and progression stops counting it."
  confirmLabel="Delete"
  saving={busy}
  onConfirm={remove}
/>

<ConfirmDialog
  open={confirmReplace}
  onOpenChange={(v) => (confirmReplace = v)}
  title="A workout is already running"
  description="Start this one instead? The running workout is discarded."
  confirmLabel="Discard and start"
  cancelLabel="Keep it"
  saving={busy}
  onConfirm={() => doAgain(true)}
/>

<ConfirmDialog
  open={confirmDiscard}
  onOpenChange={(v) => (confirmDiscard = v)}
  title="Discard your changes?"
  description="What you changed in this session won't be saved."
  confirmLabel="Discard"
  cancelLabel="Keep editing"
  onConfirm={() => { confirmDiscard = false; stopEditing(true); }}
/>

{#if session}
  <CreatePostSheet open={sharing} prefillSession={session} onclose={() => (sharing = false)} />
{/if}
