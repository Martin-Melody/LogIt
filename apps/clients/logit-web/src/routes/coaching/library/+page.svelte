<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { libraryApi } from "@logit/core/api/libraryApi";
  import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
  import { KIND_LABEL, entryDetails, filterLibrary, type LibraryEntry, type LibraryKind } from "@logit/core/domain/library";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import { loadWebLibrary, programsUsing, type WebLibrary } from "$lib/features/library/libraryData";

  // Coaching › Library: your own items (the same ones as Me › Library), with the switch
  // that decides whether your clients see each one. Anything in a program you've assigned
  // goes to that client with the program, so it shows as "Via program" and stays on.

  let lib = $state<WebLibrary | null>(null);
  let programs = $state<MyCoachProgram[]>([]);
  let error = $state<string | null>(null);
  let kind = $state<LibraryKind | "all">("all");
  let query = $state("");
  let busy = $state<string | null>(null);

  async function load() {
    try {
      [lib, programs] = await Promise.all([loadWebLibrary(), getWebCoachProgramRepo().listMyPrograms()]);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your library";
    }
  }
  onMount(load);

  const libraryPrograms = $derived(programs.filter((r) => r.recipientUserId === null && !r.program.archived).map((r) => r.program));
  const assigned = $derived(programs.filter((r) => r.recipientUserId !== null && !r.program.archived).map((r) => r.program));

  const rows = $derived(
    lib ? filterLibrary(lib.own, { kind: kind === "all" ? undefined : kind, query }) : [],
  );

  /** Library programs and client copies, each name once. */
  function inPrograms(e: LibraryEntry): string {
    const names = [...new Set(programsUsing(e, [...libraryPrograms, ...assigned]).map((p) => p.name))];
    return names.length ? names.join(", ") : "none";
  }
  const viaProgram = (e: LibraryEntry) => programsUsing(e, assigned).length > 0;
  const isShared = (e: LibraryEntry) => lib?.sharedIds.has(e.item.id) ?? false;

  async function setShared(ids: string[], shared: boolean) {
    if (!lib || ids.length === 0) return;
    busy = ids.length === 1 ? ids[0] : "all";
    try {
      await libraryApi.setSharing(ids, shared);
      const next = new Set(lib.sharedIds);
      for (const id of ids) {
        if (shared) next.add(id);
        else next.delete(id);
      }
      lib = { ...lib, sharedIds: next };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      busy = null;
    }
  }

  const unsharedShown = $derived(rows.filter((e) => !isShared(e)).map((e) => e.item.id));
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Library</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">Your own exercises, cardio and mobility. Clients always have LogIt's; you choose which of yours they see.</p>
    </div>
    <a href="/library" class="inline-flex h-[34px] items-center rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">New item</a>
  </header>

  <div class="flex flex-wrap items-center justify-between gap-2.5">
    <Tabs.Root value={kind} onValueChange={(v) => (kind = v as typeof kind)}>
      <Tabs.List aria-label="Kind" class="h-auto w-auto rounded-[9px]">
        {#each (["all", "strength", "cardio", "mobility"] as const) as k (k)}<Tabs.Trigger value={k} class="h-8 px-3.5 data-[state=active]:shadow-none rounded-lg data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground rounded-[7px]">{k === "all" ? "All" : KIND_LABEL[k]}</Tabs.Trigger>{/each}
      </Tabs.List>
    </Tabs.Root>
    <div class="flex items-center gap-2">
      <label for="clib-q" class="sr-only">Search your library</label>
      <input id="clib-q" bind:value={query} placeholder="Search your library" class="h-9 w-60 max-w-full rounded-lg border border-border bg-background px-2.5 text-sm" />
      <button type="button" disabled={!!busy || unsharedShown.length === 0} onclick={() => setShared(unsharedShown, true)}
        class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50">Share all</button>
    </div>
  </div>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !lib}
    <Skeleton class="h-80" />
  {:else if lib.own.length === 0}
    <div class="rounded-[10px] border border-border bg-card p-6 text-[13px] text-muted-foreground">
      Nothing of your own yet. Add exercises, cardio and drills in <a href="/library" class="underline">Me › Library</a> or on your phone, then share them here.
    </div>
  {:else}
    <section class="overflow-x-auto rounded-[10px] border border-border bg-card px-2 py-1.5">
      <table class="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr class="text-left text-[11px] text-muted-foreground">
            <th class="w-[34%] px-2.5 py-2 font-medium">Item</th>
            <th class="px-2.5 py-2 font-medium">Kind</th>
            <th class="px-2.5 py-2 font-medium">Details</th>
            <th class="px-2.5 py-2 font-medium">In programs</th>
            <th class="px-2.5 py-2 text-right font-medium">Clients see it</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as e (e.item.id)}
            {@const via = viaProgram(e)}
            {@const on = via || isShared(e)}
            <tr class="border-t border-border">
              <td class="px-2.5 py-2.5 font-semibold"><a href="/library?{e.kind === 'strength' ? '' : `kind=${e.kind}&`}id={encodeURIComponent(e.item.id)}" class="hover:underline">{e.item.name}</a></td>
              <td class="px-2.5 py-2.5"><span class="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{KIND_LABEL[e.kind]}</span></td>
              <td class="px-2.5 py-2.5 text-muted-foreground">{entryDetails(e)}</td>
              <td class="px-2.5 py-2.5 text-muted-foreground">{e.kind === "mobility" ? "n/a" : inPrograms(e)}</td>
              <td class="px-2.5 py-2.5 text-right">
                {#if via}<span class="mr-2 text-xs text-muted-foreground">Via program</span>{/if}
                <button type="button" role="switch" aria-checked={on} disabled={via || busy !== null}
                  aria-label={via ? `${e.item.name} goes to clients with an assigned program` : `Share ${e.item.name} with clients`}
                  onclick={() => setShared([e.item.id], !on)}
                  class="relative inline-block h-5 w-9 rounded-full align-middle transition-colors {via ? 'opacity-55' : ''} {on ? 'bg-success' : 'bg-muted-foreground/30'}">
                  <span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {on ? 'right-0.5' : 'left-0.5'}"></span>
                </button>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="px-2.5 py-4 text-muted-foreground">Nothing matches that.</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <div class="flex flex-wrap gap-4">
      <div class="flex-[1_1_320px] rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px] leading-normal">
        <div class="mb-1 font-semibold">"Via program"</div>
        <span class="text-muted-foreground">Anything in a program you've assigned goes to that client with the program, so they can see how to do it and swap by muscle. Turning the switch off only hides it from clients who don't have the program.</span>
      </div>
      <div class="flex-[1_1_320px] rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px] leading-normal">
        <div class="mb-1 font-semibold">What clients get</div>
        <span class="text-muted-foreground">Shared items show under your name in their library and pickers, read-only. Changes you save reach them on their next sync. Stop sharing and their past workouts keep the name.</span>
      </div>
    </div>
  {/if}
</div>
