<!-- Start from a program (canvas PG5): yours, LogIt's, or a community pack's, with a preview.
     Copying makes it yours; the original never changes. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { HostedRegistryEntry } from "@logit/core/api/pluginsApi";
  import { dayPreview, programSummary, type CoachProgram } from "@logit/core/domain/CoachProgram";
  import { communityPacks, loadPack, logitPrograms } from "./programSources";

  type Source = "yours" | "logit" | "community";
  type Pick = { program: CoachProgram; origin: CoachProgram["origin"] | null };

  let { open = $bindable(false), yours, tab = $bindable<Source>("logit"), oncopy }: {
    open?: boolean;
    yours: CoachProgram[];
    tab?: Source;
    oncopy: (pick: Pick) => Promise<void>;
  } = $props();

  const logit = logitPrograms();
  let packs = $state<HostedRegistryEntry[] | null>(null);
  let packPrograms = $state<Record<string, CoachProgram[] | string>>({});
  let selected = $state<Pick | null>(null);
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    if (packs === null) void communityPacks().then((p) => (packs = p), () => (packs = []));
  });
  $effect(() => {
    // The first one of the tab, so the preview is never empty.
    if (!open) return;
    if (tab === "yours") selected = yours[0] ? { program: yours[0], origin: null } : null;
    else if (tab === "logit") selected = logit[0] ? { program: logit[0], origin: { kind: "logit", id: logit[0].id, name: logit[0].name } } : null;
    else selected = null;
  });

  async function openPack(e: HostedRegistryEntry) {
    if (packPrograms[e.id]) return;
    try {
      packPrograms = { ...packPrograms, [e.id]: await loadPack(e) };
    } catch (err) {
      packPrograms = { ...packPrograms, [e.id]: err instanceof Error ? err.message : "Couldn't open this pack" };
    }
  }

  async function copy() {
    if (!selected || busy) return;
    busy = true;
    try {
      await oncopy(selected);
      open = false;
    } finally {
      busy = false;
    }
  }

  const days = $derived(selected ? (selected.program.weeks[0]?.days ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex) : []);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-hidden sm:max-w-4xl">
    <Dialog.Header><Dialog.Title>Start from a program</Dialog.Title></Dialog.Header>
    <Tabs.Root bind:value={tab}>
      <Tabs.List variant="line" aria-label="Where from">
        <Tabs.Trigger value="yours">Yours <span class="ml-1 opacity-60">{yours.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="logit">LogIt <span class="ml-1 opacity-60">{logit.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="community">Community</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <div class="flex min-h-0 flex-wrap gap-4 overflow-y-auto">
      <ul class="flex min-w-0 flex-[1_1_240px] flex-col gap-1" aria-label="Programs">
        {#if tab === "yours"}
          {#each yours as p (p.id)}
            <li><button type="button" onclick={() => (selected = { program: p, origin: null })} class="flex w-full flex-col rounded-lg px-3 py-2.5 text-left {selected?.program.id === p.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}"><span class="text-sm font-semibold">{p.name}</span><span class="text-xs text-muted-foreground">{programSummary(p)}</span></button></li>
          {:else}
            <li class="px-3 py-2 text-[13px] text-muted-foreground">You haven't made a program yet.</li>
          {/each}
        {:else if tab === "logit"}
          {#each logit as p (p.id)}
            <li><button type="button" onclick={() => (selected = { program: p, origin: { kind: "logit", id: p.id, name: p.name } })} class="flex w-full flex-col rounded-lg px-3 py-2.5 text-left {selected?.program.id === p.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}"><span class="text-sm font-semibold">{p.name}</span><span class="text-xs text-muted-foreground">{programSummary(p)}</span></button></li>
          {/each}
        {:else if packs === null}
          <Skeleton class="h-24" />
        {:else}
          {#each packs as e (e.id)}
            {@const got = packPrograms[e.id]}
            <li class="flex flex-col">
              <button type="button" onclick={() => void openPack(e)} class="flex w-full flex-col rounded-lg px-3 py-2.5 text-left hover:bg-muted/50">
                <span class="text-sm font-semibold">{e.name}</span>
                <span class="text-xs text-muted-foreground">{e.author ? `by ${e.author}` : "Community"}{e.reviewedAt ? ` · updated ${new Date(e.reviewedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>
              </button>
              {#if typeof got === "string"}<p class="px-3 pb-2 text-xs text-destructive">{got}</p>
              {:else if got}
                {#each got as p (p.id)}
                  <button type="button" onclick={() => (selected = { program: p, origin: { kind: "community", id: e.id, name: p.name, ...(e.author ? { author: e.author } : {}) } })}
                    class="ml-3 flex flex-col rounded-lg px-3 py-2 text-left {selected?.program.id === p.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}"><span class="text-[13px] font-medium">{p.name}</span><span class="text-xs text-muted-foreground">{programSummary(p)}</span></button>
                {/each}
              {/if}
            </li>
          {:else}
            <li class="px-3 py-2 text-[13px] text-muted-foreground">No program packs in the directory yet. Anyone with Pro can make one in Plugins › Build.</li>
          {/each}
        {/if}
      </ul>

      <section class="flex min-w-0 flex-[2_1_380px] flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-3.5" aria-live="polite">
        {#if selected}
          <div>
            <h3 class="text-[17px] font-bold">{selected.program.name}</h3>
            <p class="text-xs text-muted-foreground">{programSummary(selected.program)}</p>
            {#if selected.program.description}<p class="mt-1.5 text-[13px]">{selected.program.description}</p>{/if}
          </div>
          <ul class="flex flex-col gap-2">
            {#each days as d, i (d.id)}
              <li class="text-[13px]"><b class="font-semibold">{d.name ?? `Day ${i + 1}`}</b> <span class="text-muted-foreground">{dayPreview(d) || "Rest"}</span></li>
            {/each}
          </ul>
          <p class="text-xs text-muted-foreground">{selected.origin ? "Copying makes it yours to change; the original never changes." : "Copying makes a new program from this one; clients on the original keep theirs."}</p>
        {:else}
          <p class="text-[13px] text-muted-foreground">{tab === "community" ? "Open a pack to see its programs." : "Pick a program to see it."}</p>
        {/if}
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={!selected || busy} onclick={() => void copy()}>{busy ? "Copying…" : "Copy to my programs"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
