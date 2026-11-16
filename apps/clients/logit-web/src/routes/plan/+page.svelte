<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { archiveSplit, createSplit, type WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
  import { duplicateSplit } from "@logit/core/domain/splitSchedule";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { getOwnProfile, getWebDeps } from "$lib/deps";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import {
    deleteSplit,
    loadSplits,
    saveSplit,
    setActiveSplit,
    SplitConflictError,
  } from "$lib/features/plan/splits";
  import SplitEditor from "$lib/features/plan/SplitEditor.svelte";
  import PlanTabs from "$lib/features/plan/PlanTabs.svelte";

  // Your splits, editable on a big screen. Changes collect in a draft and go to the server
  // on Save, so a half-built split never reaches the phone.

  let splits = $state<WorkoutSplit[]>([]);
  let activeId = $state<string | null>(null);
  let unit = $state<WeightUnit>("kg");
  let index = $state<ExerciseIndex | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  /** The split being edited, and the server version it started from (null: not saved yet). */
  let draft = $state<WorkoutSplit | null>(null);
  let base = $state<WorkoutSplit | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let conflict = $state<{ latest: WorkoutSplit | null } | null>(null);
  let showArchived = $state(false);
  let confirmDelete = $state<WorkoutSplit | null>(null);
  /** Leaving with unsaved changes: where to, once they say discard. */
  let pendingLeave = $state<(() => void) | null>(null);

  const dirty = $derived(draft != null && (base == null || JSON.stringify(draft) !== JSON.stringify(base)));
  const live = $derived(splits.filter((s) => !s.archived));
  const archived = $derived(splits.filter((s) => s.archived));

  async function load() {
    loading = true;
    error = null;
    try {
      const deps = getWebDeps();
      const [all, profile, sessions] = await Promise.all([
        loadSplits(),
        getOwnProfile(),
        deps.workoutRepo.listAllSessions().catch(() => []),
      ]);
      splits = all;
      activeId = profile?.activeSplitId ?? null;
      unit = profile?.weightUnit === "lbs" ? "lbs" : "kg";
      index = await loadExerciseIndex(sessions);
      const wanted = page.url.searchParams.get("id");
      const first = all.find((s) => s.id === wanted) ?? all.find((s) => s.id === activeId) ?? live[0] ?? null;
      open(first);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your splits.";
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  function open(s: WorkoutSplit | null) {
    draft = s ? structuredClone($state.snapshot(s)) as WorkoutSplit : null;
    base = s;
    saveError = null;
    if (s && page.url.searchParams.get("id") !== s.id) void goto(`/plan?id=${s.id}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  /** Run `go` now, or after "Discard changes?" when there are unsaved ones. */
  function guard(go: () => void) {
    if (dirty) pendingLeave = go;
    else go();
  }

  function newSplit() {
    guard(() => {
      const s = createSplit("New split");
      draft = { ...s, schedule: "weekdays" };
      base = null;
      saveError = null;
    });
  }

  function duplicate() {
    if (!draft) return;
    const copy = duplicateSplit($state.snapshot(draft) as WorkoutSplit);
    guard(() => {
      draft = copy;
      base = null;
    });
  }

  async function save(overwrite = false) {
    if (!draft || saving) return;
    saving = true;
    saveError = null;
    try {
      const saved = await saveSplit($state.snapshot(draft) as WorkoutSplit, base?.updatedAtMs ?? null, { overwrite });
      // An archived split can't stay the one you train from.
      if (saved.archived && saved.id === activeId) {
        await setActiveSplit(null);
        activeId = null;
      }
      splits = [saved, ...splits.filter((s) => s.id !== saved.id)];
      draft = structuredClone(saved);
      base = saved;
      conflict = null;
      guideSignal("plan.saved");
    } catch (e) {
      if (e instanceof SplitConflictError) conflict = { latest: e.latest };
      else saveError = e instanceof Error ? e.message : "Couldn't save.";
    } finally {
      saving = false;
    }
  }

  function takeTheirs() {
    const latest = conflict?.latest ?? null;
    conflict = null;
    if (latest) {
      splits = [latest, ...splits.filter((s) => s.id !== latest.id)];
      open(latest);
    } else {
      splits = splits.filter((s) => s.id !== draft?.id);
      open(live[0] ?? null);
    }
  }

  async function makeActive() {
    if (!draft || !base) return;
    try {
      await setActiveSplit(draft.id);
      activeId = draft.id;
    } catch (e) {
      saveError = e instanceof Error ? e.message : "Couldn't change the active split.";
    }
  }

  async function doDelete() {
    const s = confirmDelete;
    confirmDelete = null;
    if (!s) return;
    try {
      await deleteSplit(s.id);
      splits = splits.filter((x) => x.id !== s.id);
      if (draft?.id === s.id) open(live[0] ?? null);
    } catch (e) {
      saveError = e instanceof Error ? e.message : "Couldn't delete it.";
    }
  }

  beforeNavigate((nav) => {
    if (!dirty || nav.type === "leave" || nav.to?.url.pathname === "/plan") return;
    nav.cancel();
    const to = nav.to?.url;
    if (to) pendingLeave = () => { draft = base; void goto(to); };
  });
  onMount(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });

  function summary(s: WorkoutSplit): string {
    const n = s.days.filter((d) => !d.rest).length;
    return `${n} workout${n === 1 ? "" : "s"} · ${s.schedule === "weekdays" ? "on weekdays" : "rotation"}`;
  }
</script>

<div class="flex flex-col gap-4 pb-20">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-4">
      <h1 class="text-[26px] font-bold tracking-tight">Plan</h1>
      <PlanTabs current="splits" />
    </div>
    <Button variant="outline" onclick={newSplit}>+ New split</Button>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading || !index}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-72 flex-[1_1_220px]" /><Skeleton class="h-[32rem] flex-[999_1_640px]" /></div>
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <nav aria-label="Your splits" data-guide="plan-splits" class="flex max-w-full flex-[1_1_220px] flex-col gap-0.5 rounded-[10px] border border-border bg-card p-2">
        <p class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your splits</p>
        {#if draft && base == null}
          <span class="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2.5 ring-1 ring-border">
            <span class="text-sm font-semibold">{draft.name}</span><span class="text-xs text-muted-foreground">Not saved yet</span>
          </span>
        {/if}
        {#each live as s (s.id)}
          <button type="button" onclick={() => guard(() => open(s))} aria-current={draft?.id === s.id ? "true" : undefined}
            class="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left {draft?.id === s.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
            <span class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold">{s.name}</span>
              {#if s.id === activeId}<span class="shrink-0 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Active</span>{/if}
            </span>
            <span class="text-xs text-muted-foreground">{summary(s)}</span>
          </button>
        {/each}
        {#if live.length === 0 && !(draft && base == null)}
          <p class="px-3 py-2 text-[13px] text-muted-foreground">No splits yet.</p>
        {/if}
        {#if archived.length}
          <button type="button" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)} class="mt-1 rounded-lg px-3 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted/50">
            Archived ({archived.length}) {showArchived ? "▴" : "▾"}
          </button>
          {#if showArchived}
            {#each archived as s (s.id)}
              <button type="button" onclick={() => guard(() => open(s))} aria-current={draft?.id === s.id ? "true" : undefined}
                class="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left {draft?.id === s.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
                <span class="truncate text-[13px] font-medium text-muted-foreground">{s.name}</span>
              </button>
            {/each}
          {/if}
        {/if}
        <p class="mx-1 mt-1.5 border-t border-border px-2 pt-2.5 pb-1 text-xs leading-relaxed text-muted-foreground">
          Want a ready-made one? <a href="/plan/programs" class="text-primary hover:underline">Programs ›</a>
        </p>
      </nav>

      <section data-guide="plan-editor" data-guide-empty={draft ? undefined : ""} class="flex min-w-0 flex-[999_1_640px] flex-col gap-4 rounded-[10px] border border-border bg-card px-[22px] py-5">
        {#if draft}
          <div class="flex flex-wrap items-center justify-end gap-2">
            {#if draft.archived}
              <span class="mr-auto rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Archived: the app doesn't show it</span>
              <Button variant="outline" size="sm" onclick={() => (draft = archiveSplit(draft!, false))}>Unarchive</Button>
              {#if base}<Button variant="outline" size="sm" class="text-destructive" onclick={() => (confirmDelete = base)}>Delete</Button>{/if}
            {:else}
              {#if base && draft.id !== activeId}
                <Button variant="outline" size="sm" onclick={() => void makeActive()} disabled={dirty} title={dirty ? "Save first" : undefined}>Make active</Button>
              {:else if draft.id === activeId}
                <span class="mr-auto text-xs text-muted-foreground">The app trains from this split.</span>
              {/if}
              <Button variant="outline" size="sm" onclick={duplicate}>Duplicate</Button>
              <Button variant="outline" size="sm" onclick={() => (draft = archiveSplit(draft!, true))}>Archive</Button>
            {/if}
          </div>
          <SplitEditor split={draft} {index} {unit} onChange={(next) => (draft = next)} />
        {:else}
          <p class="py-10 text-center text-[13px] text-muted-foreground">No split picked. Make a new one, or copy one from <a href="/plan/programs" class="text-primary hover:underline">Programs</a>.</p>
        {/if}
      </section>
    </div>
  {/if}

  {#if draft && (dirty || saveError)}
    <div role="region" aria-label="Unsaved changes" data-guide="plan-save"
      class="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-lg">
      <span class="text-[13px]">
        {#if saveError}<span class="text-destructive">{saveError}</span>
        {:else}{base ? "Unsaved changes" : "New split, not saved yet"} <span class="text-muted-foreground">· Your phone gets them next time it syncs.</span>{/if}
      </span>
      <span class="flex gap-2">
        <Button variant="outline" size="sm" onclick={() => (base ? open(base) : open(live.find((s) => s.id === activeId) ?? live[0] ?? null))}>Discard</Button>
        <Button size="sm" disabled={saving} onclick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
      </span>
    </div>
  {/if}
</div>

<AlertDialog.Root open={conflict != null} onOpenChange={(o) => { if (!o) conflict = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{conflict?.latest ? "Changed on another device" : "Deleted on another device"}</AlertDialog.Title>
      <AlertDialog.Description>
        {conflict?.latest
          ? "This split was changed (probably on your phone) since you opened it here. Saving yours replaces those changes."
          : "This split was deleted since you opened it here. Saving brings it back with your changes."}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={takeTheirs}>{conflict?.latest ? "Load theirs, drop mine" : "Drop mine"}</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void save(true)}>{conflict?.latest ? "Save mine over it" : "Save it again"}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={pendingLeave != null} onOpenChange={(o) => { if (!o) pendingLeave = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Discard your changes?</AlertDialog.Title>
      <AlertDialog.Description>You have changes to “{draft?.name}” that aren't saved.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={() => { const go = pendingLeave; pendingLeave = null; go?.(); }}>Discard</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={confirmDelete != null} onOpenChange={(o) => { if (!o) confirmDelete = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete “{confirmDelete?.name}”?</AlertDialog.Title>
      <AlertDialog.Description>It's removed from every device. Your logged workouts stay.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={() => void doDelete()}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
