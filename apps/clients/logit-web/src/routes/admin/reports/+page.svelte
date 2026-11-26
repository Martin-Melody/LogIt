<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import { Kbd } from "$lib/components/ui/kbd";
  import RowMenuItems from "$lib/features/commands/RowMenuItems.svelte";
  import { isTyping, type RowAction } from "$lib/features/commands/commands.svelte";
  import PersonHoverCard from "$lib/features/admin/PersonHoverCard.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { ago, shortDate, when } from "$lib/features/coaching/format";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { adminApi, at, type PersonRow, type Report, type ReportPreview } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";

  let reports = $state<Report[]>([]);
  let previews = $state<Record<string, ReportPreview>>({});
  let error = $state<string | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  // Deleting for everyone can't be undone: asked first (bug hunt 5.13).
  let confirmDelete = $state<Report | null>(null);
  let author = $state<PersonRow | null>(null);

  const MONTH = 30 * 86_400_000;
  const open = $derived(reports.filter((r) => r.status === "Open"));
  const closed = $derived(reports.filter((r) => r.status !== "Open" && r.reviewedAt && Date.now() - at(r.reviewedAt) < MONTH));
  const selectedId = $derived(page.url.searchParams.get("id") ?? open[0]?.id ?? null);
  const selected = $derived(reports.find((r) => r.id === selectedId) ?? null);
  const preview = $derived(selected ? previews[selected.targetId] : undefined);
  // How many open reports point at the same post or comment.
  const sameTarget = $derived(selected ? open.filter((r) => r.targetId === selected.targetId).length : 0);

  async function load() {
    try {
      const r = await adminApi.reports();
      reports = r.reports;
      previews = r.previews;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load reports";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  // The author's account, for the facts row and the "Open their page" button.
  $effect(() => {
    const name = preview?.author;
    author = null;
    if (!name) return;
    void adminApi.people(name).then((r) => {
      if (preview?.author === name) author = r.users.find((u) => u.username === name) ?? null;
    }).catch(() => {});
  });

  async function resolve(r: Report, action: "dismiss" | "delete-target") {
    busy = true;
    try {
      await adminApi.resolveReport(r.id, action);
      toast.success(action === "dismiss" ? "Report dismissed" : `${r.targetType} deleted`);
      await load();
      void adminState.refreshCounts();
      await goto(open[0] ? `/admin/reports?id=${open[0].id}` : "/admin/reports", { replaceState: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't close the report");
    } finally {
      busy = false;
    }
  }

  async function openPerson(username: string) {
    const r = await adminApi.people(username).catch(() => null);
    const p = r?.users.find((u) => u.username === username);
    if (p) void goto(`/admin/people?id=${p.id}`);
    else toast.error(`No account called @${username} any more`);
  }

  // One list for a report row's ⋯ menu and its right-click menu.
  function reportActions(r: Report): RowAction[] {
    const pv = previews[r.targetId];
    const kind = r.targetType.toLowerCase();
    const isOpen = r.status === "Open";
    return [
      { id: "open", label: "Open the report", href: `/admin/reports?id=${r.id}` },
      ...(isOpen ? [
        { id: "delete", label: `Delete the ${kind}…`, run: () => (confirmDelete = r), danger: true, separatorBefore: true, disabled: !pv ? "Gone" : pv.deleted ? "Already deleted" : undefined },
        { id: "dismiss", label: "Dismiss the report", run: () => void resolve(r, "dismiss") },
      ] : []),
      ...(pv?.author ? [{ id: "author", label: `Open @${pv.author}'s page`, run: () => void openPerson(pv.author), separatorBefore: true }] : []),
      { id: "reporter", label: `Open @${r.reporter.username}'s page`, href: `/admin/people?id=${r.reporter.id}`, separatorBefore: !pv?.author },
    ];
  }

  // With an open report showing: Delete/Backspace asks to delete it, E dismisses it. Either
  // way the next open report shows, so the queue can be cleared from the keyboard.
  function onKey(e: KeyboardEvent) {
    const r = selected;
    if (!r || r.status !== "Open" || busy || confirmDelete || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
    if ((e.key === "Backspace" || e.key === "Delete") && preview && !preview.deleted) {
      e.preventDefault();
      confirmDelete = r;
    } else if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      void resolve(r, "dismiss");
    }
  }

  const statusText = (r: Report) => (r.status === "Actioned" ? `${r.targetType} deleted` : "Dismissed");
  const btn = "inline-flex h-9 items-center whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-medium disabled:opacity-50";
</script>

<svelte:window onkeydown={onKey} />

<div class="flex flex-wrap items-start gap-6">
  <section aria-label="Reports" class="min-w-0 flex-[1_1_300px] md:max-w-[360px] {page.url.searchParams.has('id') ? 'max-md:hidden' : ''}">
    <h1 class="mb-3 text-[26px] font-bold tracking-tight">Reports</h1>
    {#if error}
      <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
    {:else if loading}
      <Skeleton class="h-48" />
    {:else}
      {#each [["Open", open], ["Closed in the last 30 days", closed]] as [label, list] (label)}
        {@const rows = list as Report[]}
        <h2 class="flex justify-between px-3 pb-1.5 pt-3 text-xs font-medium text-muted-foreground"><span>{label}</span><span>{rows.length}</span></h2>
        <ul>
          {#each rows as r (r.id)}
            {@const actions = reportActions(r)}
            <ContextMenu.Root>
            <ContextMenu.Trigger>
            {#snippet child({ props })}
            <li {...props} class="flex items-start rounded-lg hover:bg-muted data-[state=open]:bg-muted {selectedId === r.id ? 'bg-muted' : ''}">
              <a href="/admin/reports?id={r.id}" aria-current={selectedId === r.id ? "page" : undefined}
                class="grid min-w-0 flex-1 grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg py-2.5 pr-1 pl-3">
                <span class="mt-1.5 size-2 rounded-full {r.status === 'Open' ? 'bg-destructive' : 'bg-success'}" aria-hidden="true"></span>
                <span class="min-w-0">
                  <span class="block truncate text-sm {r.status === 'Open' ? 'font-medium' : 'text-muted-foreground'}">{r.targetType} by @{previews[r.targetId]?.author ?? "someone"}, reported as {r.reason.toLowerCase()}</span>
                  <span class="block truncate text-xs text-muted-foreground">{r.status === "Open" ? `By @${r.reporter.username}` : statusText(r)}</span>
                </span>
                <span class="text-xs text-muted-foreground">{ago(at(r.status === "Open" ? r.createdAt : r.reviewedAt!))}</span>
              </a>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger aria-label="More for this report"
                  class="mt-1.5 mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground data-[state=open]:text-foreground">
                  <EllipsisIcon class="size-4" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="w-auto min-w-60"><RowMenuItems {actions} kind="dropdown" /></DropdownMenu.Content>
              </DropdownMenu.Root>
            </li>
            {/snippet}
            </ContextMenu.Trigger>
            <ContextMenu.Content class="w-auto min-w-60"><RowMenuItems {actions} kind="context" /></ContextMenu.Content>
            </ContextMenu.Root>
          {:else}
            <li class="px-3 py-3 text-[13px] text-muted-foreground">{label === "Open" ? "No open reports." : "None."}</li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <section aria-label="Report" class="min-w-0 flex-[999_1_520px] {page.url.searchParams.has('id') ? '' : 'max-md:hidden'}">
    {#if loading}
      <Skeleton class="h-80" />
    {:else if !selected}
      <p class="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">When someone reports a post or comment, it shows here for you to delete it or dismiss the report.</p>
    {:else}
      {@const r = selected}
      <div class="flex flex-col gap-4">
        <a href="/admin/reports" class="{btn} self-start bg-muted md:hidden"><ArrowLeftIcon class="mr-1.5 size-4" />All reports</a>
        <header>
          <h2 class="text-[22px] font-bold tracking-tight">{r.targetType} by {#if preview?.author}<PersonHoverCard username={preview.author} id={author?.id} class="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">@{preview.author}</PersonHoverCard>{:else}someone{/if}, reported as {r.reason.toLowerCase()}</h2>
          <p class="text-[13px] text-muted-foreground">Reported by <PersonHoverCard username={r.reporter.username} id={r.reporter.id} class="hover:text-foreground hover:underline">@{r.reporter.username}</PersonHoverCard> · {ago(at(r.createdAt))}{sameTarget > 1 ? ` · ${sameTarget} open reports on this ${r.targetType.toLowerCase()}` : ""}</p>
        </header>
        {#if r.note}<p class="rounded-xl border border-border bg-card px-4 py-3 text-sm"><span class="text-muted-foreground">Their note:</span> {r.note}</p>{/if}
        <article class="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-5">
          {#if preview}
            <div class="flex items-center gap-3"><Avatar name={preview.author} size={36} /><span class="text-sm">@{preview.author}</span></div>
            <p class="whitespace-pre-wrap text-[15px] leading-relaxed {preview.deleted ? 'text-muted-foreground line-through' : ''}">{preview.body}</p>
            {#if preview.photoUrl}<img src={photoSrc(preview.photoUrl)} alt="What was reported" class="max-h-80 max-w-full rounded-lg border border-border object-contain" />{/if}
            {#if preview.deleted}<p class="text-xs text-muted-foreground">Already deleted.</p>{/if}
          {:else}
            <p class="text-[13px] text-muted-foreground">This {r.targetType.toLowerCase()} no longer exists.</p>
          {/if}
        </article>
        {#if author}
          <div class="flex flex-wrap gap-2.5">
            {#each [[`@${author.username}'s posts`, `${author.postCount}`], ["Joined", shortDate(at(author.createdAt))], ["Last seen", author.lastActive ? when(at(author.lastActive)) : "Not yet"]] as [label, value] (label)}
              <div class="flex-[1_1_130px] rounded-xl border border-border bg-card px-3.5 py-3"><span class="block text-xs text-muted-foreground">{label}</span><strong class="text-[17px] font-semibold">{value}</strong></div>
            {/each}
          </div>
        {/if}
        {#if r.status === "Open"}
          <div class="flex flex-wrap gap-2.5">
            <button type="button" class="{btn} bg-destructive font-semibold text-white" disabled={busy || !preview || preview.deleted} onclick={() => (confirmDelete = r)}>Delete {r.targetType.toLowerCase()}</button>
            <button type="button" class="{btn} bg-muted hover:bg-accent" disabled={busy} onclick={() => resolve(r, "dismiss")}>Dismiss report</button>
            {#if author}<a href="/admin/people?id={author.id}" class="{btn} ml-auto bg-muted hover:bg-accent">Open @{author.username}'s page</a>{/if}
          </div>
          <div class="flex flex-col gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
            <p class="flex flex-wrap items-center gap-1.5">Keys: <Kbd>⌫</Kbd> delete, <Kbd>E</Kbd> dismiss. The next open report shows after either.</p>
            <p><strong class="font-medium text-foreground">Delete</strong> removes it for everyone and closes {sameTarget > 1 ? "every open report on it" : "the report"}. LogIt doesn't tell @{preview?.author ?? "the author"}.</p>
            <p><strong class="font-medium text-foreground">Dismiss</strong> keeps it and closes {sameTarget > 1 ? "every open report on it" : "the report"}. @{r.reporter.username} can still block @{preview?.author ?? "the author"} themselves.</p>
          </div>
        {:else}
          <p class="text-[13px] text-muted-foreground">{statusText(r)} {r.reviewedAt ? ago(at(r.reviewedAt)) : ""}.</p>
        {/if}
      </div>
    {/if}
  </section>
</div>

<AlertDialog.Root open={confirmDelete !== null} onOpenChange={(o) => { if (!o) confirmDelete = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this {confirmDelete?.targetType.toLowerCase() ?? "post"} for everyone?</AlertDialog.Title>
      <AlertDialog.Description>It can't be brought back. Its open reports close too.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => { const r = confirmDelete; confirmDelete = null; if (r) void resolve(r, "delete-target"); }}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
