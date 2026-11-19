<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { reveal } from "$lib/transitions";
  import { ago, when } from "$lib/features/coaching/format";
  import { aroundChanges, lineDiff } from "@logit/core/plugins/reviewDiff";
  import { adminApi, at, type PluginRelease, type PluginReleaseRow } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";

  let rows = $state<PluginReleaseRow[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let release = $state<PluginRelease | null>(null);
  let releaseError = $state<string | null>(null);
  let note = $state("");
  let busy = $state(false);
  let showAll = $state(false);

  const waiting = $derived(rows.filter((r) => r.status === "Pending"));
  const reviewed = $derived(rows.filter((r) => r.status === "Approved" || r.status === "Rejected").sort((a, b) => at(b.reviewedAt ?? b.submittedAt) - at(a.reviewedAt ?? a.submittedAt)).slice(0, 20));
  const selectedId = $derived(page.url.searchParams.get("id") ?? waiting[0]?.id ?? null);
  const selectedRow = $derived(rows.find((r) => r.id === selectedId) ?? null);

  const diff = $derived(release?.previous ? lineDiff(release.previous.source, release.source) : null);
  const shown = $derived(diff && !showAll ? aroundChanges(diff) : null);
  const counts = $derived(diff ? { add: diff.filter((l) => l.kind === "add").length, del: diff.filter((l) => l.kind === "del").length } : null);

  async function load() {
    try {
      rows = (await adminApi.pluginReleases()).releases;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load plugin reviews";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  $effect(() => {
    const id = selectedId;
    release = null;
    releaseError = null;
    note = "";
    showAll = false;
    if (!id) return;
    void adminApi.pluginRelease(id).then((r) => { if (selectedId === id) release = r; })
      .catch((e) => { releaseError = e instanceof Error ? e.message : "Couldn't load this version"; });
  });

  async function review(approve: boolean) {
    if (!release || !selectedRow) return;
    busy = true;
    try {
      await adminApi.reviewPlugin(release.id, approve, note);
      toast.success(approve ? `${selectedRow.name} ${release.version} is listed` : `Asked ${release.owner} for changes`);
      await load();
      void adminState.refreshCounts();
      await goto(waiting[0] ? `/admin/plugins?id=${waiting[0].id}` : "/admin/plugins", { replaceState: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the review");
    } finally {
      busy = false;
    }
  }

  const statusText = (r: PluginReleaseRow) => (r.status === "Approved" ? "Approved" : "Changes asked");
  const btn = "inline-flex h-9 items-center whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-medium disabled:opacity-50";
</script>

<div class="flex flex-wrap items-start gap-6">
  <section aria-label="Plugin versions" class="min-w-0 flex-[1_1_300px] md:max-w-[360px] {page.url.searchParams.has('id') ? 'max-md:hidden' : ''}">
    <h1 class="mb-3 text-[26px] font-bold tracking-tight">Plugin reviews</h1>
    {#if error}
      <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
    {:else if loading}
      <Skeleton class="h-48" />
    {:else}
      {#each [["Waiting", waiting], ["Reviewed", reviewed]] as [label, list] (label)}
        {@const items = list as PluginReleaseRow[]}
        <h2 class="flex justify-between px-3 pb-1.5 pt-3 text-xs font-medium text-muted-foreground"><span>{label}</span><span>{items.length}</span></h2>
        <ul>
          {#each items as r (r.id)}
            <li>
              <a href="/admin/plugins?id={r.id}" aria-current={selectedId === r.id ? "page" : undefined}
                class="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-muted {selectedId === r.id ? 'bg-muted' : ''}">
                <span class="min-w-0">
                  <span class="block truncate text-sm {r.status === 'Pending' ? 'font-medium' : 'text-muted-foreground'}">{r.name} {r.version}</span>
                  <span class="block truncate text-xs text-muted-foreground">{r.status === "Pending" ? `By @${r.owner}` : statusText(r)}</span>
                </span>
                <span class="text-xs text-muted-foreground">{ago(at(r.reviewedAt ?? r.submittedAt))}</span>
              </a>
            </li>
          {:else}
            <li class="px-3 py-3 text-[13px] text-muted-foreground">{label === "Waiting" ? "Nothing waiting." : "None yet."}</li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <section aria-label="Version" class="min-w-0 flex-[999_1_520px] {page.url.searchParams.has('id') ? '' : 'max-md:hidden'}">
    {#if !selectedId && !loading}
      <p class="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">When someone publishes a plugin, each version waits here until you read it and list it, so nobody installs code you haven't seen.</p>
    {:else if releaseError}
      <Alert.Root variant="destructive"><Alert.Description>{releaseError}</Alert.Description></Alert.Root>
    {:else if !release || !selectedRow}
      <Skeleton class="h-96" />
    {:else}
      {@const r = release}
      <div class="flex flex-col gap-4">
        <a href="/admin/plugins" class="{btn} self-start bg-muted md:hidden"><ArrowLeftIcon class="mr-1.5 size-4" />All versions</a>
        <header>
          <h2 class="flex flex-wrap items-baseline gap-2.5 text-[22px] font-bold tracking-tight">{selectedRow.name} {r.version}<span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">{r.family}</span></h2>
          <p class="text-[13px] text-muted-foreground">By @{r.owner} · sent {when(at(r.submittedAt), Date.now(), true)}{r.previous ? ` · listed now: ${r.previous.version}` : " · first version"}</p>
        </header>
        {#if r.changeNote}
          <section class="rounded-xl border border-border bg-card px-4 py-3"><h3 class="text-xs font-semibold text-muted-foreground">Their note</h3><p class="whitespace-pre-wrap text-sm">{r.changeNote}</p></section>
        {/if}

        <section aria-labelledby="code" class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 id="code" class="text-sm font-semibold">
              {#if shown && counts && r.previous}What changed since {r.previous.version} <span class="font-normal text-muted-foreground">+{counts.add} −{counts.del} lines</span>{:else}The code{/if}
            </h3>
            {#if diff}<button type="button" class="{btn} h-[30px] bg-muted text-xs hover:bg-accent" onclick={() => (showAll = !showAll)}>{showAll ? "Show only the changes" : "Show all the code"}</button>{/if}
          </div>
          <pre class="relative max-h-[520px] overflow-auto py-3 font-mono text-[13px] leading-relaxed">{#if shown}{#each shown as l, n (n)}{#if l.kind === "gap"}<span class="block px-4 text-muted-foreground">⋯ {l.hidden} unchanged line{l.hidden === 1 ? "" : "s"}</span>{:else}<span class="block px-4 {l.kind === 'add' ? 'bg-success/12' : l.kind === 'del' ? 'bg-destructive/14' : ''}"><span class="mr-2 select-none text-muted-foreground" aria-hidden="true">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span><span class="sr-only">{l.kind === "add" ? "Added: " : l.kind === "del" ? "Removed: " : ""}</span>{l.text}</span>{/if}{/each}{:else}<span class="block px-4">{r.source}</span>{/if}</pre>
        </section>

        {#if selectedRow.status === "Pending"}
          <section aria-labelledby="review" class="flex flex-col gap-2.5">
            <label id="review" for="review-note" class="text-[13px] font-medium">Note to @{r.owner} <span class="font-normal text-muted-foreground">(needed to ask for changes)</span></label>
            <textarea id="review-note" bind:value={note} rows="3" maxlength="2000" placeholder="What to change, or a thank-you" class="resize-y rounded-[9px] border border-input bg-background px-3 py-2.5 text-sm"></textarea>
            <div class="flex flex-wrap gap-2.5">
              <button type="button" class="{btn} bg-primary font-semibold text-primary-foreground" disabled={busy} onclick={() => review(true)}>Approve and list {r.version}</button>
              <button type="button" class="{btn} bg-muted hover:bg-accent" disabled={busy || !note.trim()} onclick={() => review(false)}>Ask for changes</button>
            </div>
            <p class="text-[13px] text-muted-foreground">Approving lists {r.version} in Browse{r.previous ? ` in place of ${r.previous.version}` : ""}. {adminState.emailConfigured ? `Either way, @${r.owner} gets an email.` : `Email isn't set up, so tell @${r.owner} yourself; they also see it under My plugins.`}</p>
          </section>
        {:else}
          <p transition:reveal class="text-[13px] text-muted-foreground">{statusText(selectedRow)}{selectedRow.reviewedAt ? ` ${ago(at(selectedRow.reviewedAt))}` : ""}{selectedRow.reviewNote ? `: "${selectedRow.reviewNote}"` : "."}</p>
        {/if}
      </div>
    {/if}
  </section>
</div>
