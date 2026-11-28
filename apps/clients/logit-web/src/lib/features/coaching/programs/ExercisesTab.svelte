<!-- Programs › Exercises (canvas PG9, was Coaching › Library): your own exercises, cardio and
     drills, and the packs you've added. Anything used in a program you've assigned goes to that
     client with it, read-only, so they can do it and swap by muscle; packs are data, so clients
     don't allow anything. LogIt's own exercises are always there and aren't listed. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import { libraryApi } from "@logit/core/api/libraryApi";
  import type { ServedManifest } from "@logit/core/api/pluginsApi";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { KIND_LABEL, entryDetails, filterLibrary, type LibraryEntry } from "@logit/core/domain/library";
  import { parseExercisePack } from "@logit/core/plugins/exercisePack";
  import { parseMobilityPack } from "@logit/core/plugins/mobilityPack";
  import { loadWebLibrary, programsUsing, type WebLibrary } from "$lib/features/library/libraryData";
  import { fetchSource, plugins } from "$lib/features/plugins/pluginData.svelte";

  let { programs, assigned }: {
    /** Your programs (not archived). */
    programs: CoachProgram[];
    /** Clients' copies (not archived): what's in these goes to them. */
    assigned: CoachProgram[];
  } = $props();

  let lib = $state<WebLibrary | null>(null);
  let query = $state("");
  let busy = $state<string | null>(null);
  /** Each pack's exercise/drill names, once fetched. */
  let packNames = $state<Record<string, string[] | null>>({});

  // Canvas HT4: your own how-tos, for every exercise in your programs (LogIt's included).
  let howtos = $state<CoachHowTo[]>([]);
  let editing = $state<string | null>(null);
  let editOpen = $state(false);
  const programExercises = $derived([...new Set(programs.flatMap((p) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === "strength" ? [b.exerciseName] : [])))))).values()]
    .sort((a, b) => a.localeCompare(b)));
  const howtoRows = $derived(programExercises.filter((n) => !query.trim() || n.toLowerCase().includes(query.trim().toLowerCase())));
  const mineFor = (n: string) => howtos.find((h) => h.exerciseName.toLowerCase() === n.toLowerCase()) ?? null;
  const coreFor = (n: string) => CORE_EXERCISES.find((e) => e.name.toLowerCase() === n.toLowerCase()) ?? null;
  async function saveHowTos(next: CoachHowTo[]) {
    howtos = await coachApi.saveHowTos(next);
    const n = await pushHowTosToCopies(await allHowTos()).catch(() => 0);
    toast.success(n ? `Saved. ${n} ${n === 1 ? "client's program has" : "clients' programs have"} it now.` : "Saved. Clients get it with the programs that use it.");
  }

  onMount(async () => {
    void coachApi.getHowTos().then((h) => (howtos = h), () => {});
    lib = await loadWebLibrary().catch(() => null);
    await plugins.loadInstalls().catch(() => {});
    for (const p of packs) void loadPack(p.manifest as unknown as ServedManifest);
  });

  const rows = $derived(lib ? filterLibrary(lib.own, { query }) : []);
  const all = $derived([...programs, ...assigned]);
  const used = (e: LibraryEntry) => new Set(programsUsing(e, all).map((p) => p.name)).size;
  const viaProgram = (e: LibraryEntry) => programsUsing(e, assigned).length > 0;
  const shared = (e: LibraryEntry) => lib?.sharedIds.has(e.item.id) ?? false;

  const packs = $derived(plugins.installed.filter((p) => p.manifest.family === "exercise-pack" || p.manifest.family === "mobility-pack"));
  async function loadPack(m: ServedManifest) {
    try {
      const raw = JSON.parse(await fetchSource(m));
      packNames = { ...packNames, [m.id]: m.family === "mobility-pack" ? parseMobilityPack(raw, m.id).drills.map((d) => d.name) : parseExercisePack(raw, m.id).exercises.map((x) => x.name) };
    } catch {
      packNames = { ...packNames, [m.id]: null };
    }
  }
  function packPrograms(id: string): number {
    const names = new Set((packNames[id] ?? []).map((n) => n.toLowerCase()));
    if (!names.size) return 0;
    return all.filter((p) => p.weeks.some((w) => w.days.some((d) => d.blocks.some((b) => (b.type === "strength" && names.has(b.exerciseName.toLowerCase())) || (b.type === "mobility" && names.has(b.drillName.toLowerCase())))))).length;
  }

  async function setShared(e: LibraryEntry, on: boolean) {
    if (!lib) return;
    busy = e.item.id;
    try {
      await libraryApi.setSharing([e.item.id], on);
      const next = new Set(lib.sharedIds);
      if (on) next.add(e.item.id); else next.delete(e.item.id);
      lib = { ...lib, sharedIds: next };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change it");
    } finally {
      busy = null;
    }
  }

  const href = (e: LibraryEntry) => `/library?${e.kind === "strength" ? "" : `kind=${e.kind}&`}id=${encodeURIComponent(e.item.id)}`;
  const actions = (e: LibraryEntry): RowAction[] => [
    { id: "open", label: `Open ${e.item.name}`, href: href(e) },
    { id: "share", label: shared(e) ? "Stop sharing with all clients" : "Share with all clients", run: () => void setShared(e, !shared(e)), disabled: viaProgram(e) ? "In an assigned program" : undefined, separatorBefore: true },
  ];
  import HowToEditorDialog from "./HowToEditorDialog.svelte";
  import { allHowTos, pushHowTosToCopies } from "./howtoData";
  import { coachApi } from "@logit/core/api/coachApi";
  import type { CoachHowTo } from "@logit/core/domain/howTo";
  import { CORE_EXERCISES } from "@logit/core/domain/coreExercises";
  import { CORE_MISTAKES } from "@logit/core/domain/coreMistakes";
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-2.5">
    <input bind:value={query} placeholder="Search exercises" aria-label="Search exercises" class="h-9 w-72 max-w-full rounded-[9px] border border-input bg-background px-3 text-[13px]" />
    <span class="text-xs text-muted-foreground">LogIt's own exercises are always there.</span>
  </div>

  {#if !lib}
    <Skeleton class="h-64" />
  {:else}
    <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Your exercises">
      <h2 class="px-5 pb-2 pt-4 text-sm font-semibold">Yours · {lib.own.length}</h2>
      {#each rows as e (e.item.id)}
        {@const n = e.kind === "cardio" || e.kind === "strength" || e.kind === "mobility" ? used(e) : 0}
        {@const via = viaProgram(e)}
        <ActionMenu actions={actions(e)} label="More for {e.item.name}">
          {#snippet children({ props, more })}
            <article {...props} class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3 data-[state=open]:bg-muted/40">
              <a href={href(e)} class="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
                <span class="flex items-center gap-2 text-[14px] font-semibold">{e.item.name}{#if e.kind !== "strength"}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{KIND_LABEL[e.kind]}</span>{/if}</span>
                <span class="text-xs text-muted-foreground">{entryDetails(e)}</span>
              </a>
              <span class="text-[13px] {n ? '' : 'text-muted-foreground'}">{n ? `In ${n} ${n === 1 ? "program" : "programs"}` : "Not in a program"}</span>
              <label class="flex items-center gap-2 text-xs text-muted-foreground">
                {via ? "Goes with the program" : "Clients see it"}
                <Switch checked={via || shared(e)} disabled={via || busy !== null} onCheckedChange={(v) => void setShared(e, v)} aria-label="{e.item.name}: clients see it" />
              </label>
              {@render more()}
            </article>
          {/snippet}
        </ActionMenu>
      {:else}
        <p class="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">{lib.own.length ? "Nothing matches that." : "Nothing of your own yet. LogIt's exercises cover most programs; add your own for anything missing."}</p>
      {/each}
    </section>

    <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="How-tos">
      <h2 class="px-5 pb-0.5 pt-4 text-sm font-semibold">How-tos</h2>
      <p class="px-5 pb-2 text-xs text-muted-foreground">What new lifters see for each exercise in your programs: yours where you wrote one, LogIt's for the rest.</p>
      {#each howtoRows as n (n)}
        {@const mine = mineFor(n)}
        {@const core = coreFor(n)}
        <article class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-2.5">
          <span class="min-w-0 flex-[1_1_260px] text-[14px] font-medium">{n}</span>
          <span class="rounded-md px-1.5 py-0.5 text-[11px] font-semibold {mine ? 'bg-foreground text-background' : core ? 'bg-muted' : 'bg-warning/15 text-warning'}">{mine ? "Yours" : core ? "LogIt" : "None yet"}</span>
          <span class="w-56 truncate text-xs text-muted-foreground">{mine ? [mine.video ? "video" : "", mine.pictures?.length ? `${mine.pictures.length} pictures` : "", mine.note ? "your note" : ""].filter(Boolean).join(" · ") || "cues" : core ? "cues and the common mistake" : "Clients see no steps"}</span>
          <Button variant="outline" size="sm" onclick={() => { editing = n; editOpen = true; }}>{mine ? "Edit" : "Write yours"}</Button>
        </article>
      {:else}
        <p class="border-t border-border px-5 py-6 text-center text-[13px] text-muted-foreground">{programExercises.length ? "Nothing matches that." : "Exercises in your programs show here."}</p>
      {/each}
    </section>

    <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="From your packs">
      <h2 class="px-5 pb-2 pt-4 text-sm font-semibold">From your packs</h2>
      {#each packs as p (p.manifest.id)}
        {@const names = packNames[p.manifest.id]}
        {@const n = packPrograms(p.manifest.id)}
        <article class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3">
          <span class="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
            <span class="flex items-center gap-2 text-[14px] font-semibold">{p.manifest.name}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{p.manifest.family === "mobility-pack" ? "Mobility pack" : "Exercise pack"}</span></span>
            <span class="text-xs text-muted-foreground">{names ? `${names.length} ${p.manifest.family === "mobility-pack" ? "drills" : "exercises"}` : names === null ? "Couldn't read it" : "…"}{typeof p.manifest.author === "string" ? ` · by ${p.manifest.author}` : ""} · version {p.manifest.version}</span>
          </span>
          <span class="text-[13px] {n ? '' : 'text-muted-foreground'}">{n ? `In ${n} ${n === 1 ? "program" : "programs"}` : "Not in a program"}</span>
          <Button variant="outline" size="sm" href="/plugins/{encodeURIComponent(p.manifest.id)}">Open</Button>
        </article>
      {:else}
        <p class="border-t border-border px-5 py-6 text-center text-[13px] text-muted-foreground">No packs added. Packs are lists of exercises or drills people share.</p>
      {/each}
      <div class="border-t border-border px-5 py-3"><Button variant="outline" size="sm" href="/plugins">Find more in community packs</Button></div>
    </section>
    <p class="text-xs text-muted-foreground">Anything here used in a program you've assigned goes to that client with it, read-only, so they can do it and swap by muscle. Packs are data, so clients don't have to allow anything.</p>
  {/if}
</div>

{#if editing}
  {@const core = coreFor(editing)}
  <HowToEditorDialog bind:open={editOpen} exerciseName={editing} current={mineFor(editing)}
    logit={{ cues: core?.cues ?? [], mistake: core ? (CORE_MISTAKES[core.id] ?? null) : null }}
    onsave={(h) => saveHowTos([...howtos.filter((x) => x.exerciseName.toLowerCase() !== h.exerciseName.toLowerCase()), h])}
    onremove={() => saveHowTos(howtos.filter((x) => x.exerciseName.toLowerCase() !== editing!.toLowerCase()))} />
{/if}
