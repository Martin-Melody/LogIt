<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { ago, shortDate, when } from "$lib/features/coaching/format";
  import { adminApi, at, type PersonRow, type Report, type ReportPreview } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";

  let reports = $state<Report[]>([]);
  let previews = $state<Record<string, ReportPreview>>({});
  let error = $state<string | null>(null);
  let loading = $state(true);
  let busy = $state(false);
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

  const statusText = (r: Report) => (r.status === "Actioned" ? `${r.targetType} deleted` : "Dismissed");
  const btn = "inline-flex h-9 items-center whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-medium disabled:opacity-50";
</script>

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
            <li>
              <a href="/admin/reports?id={r.id}" aria-current={selectedId === r.id ? "page" : undefined}
                class="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted {selectedId === r.id ? 'bg-muted' : ''}">
                <span class="mt-1.5 size-2 rounded-full {r.status === 'Open' ? 'bg-destructive' : 'bg-success'}" aria-hidden="true"></span>
                <span class="min-w-0">
                  <span class="block truncate text-sm {r.status === 'Open' ? 'font-medium' : 'text-muted-foreground'}">{r.targetType} by @{previews[r.targetId]?.author ?? "someone"}, reported as {r.reason.toLowerCase()}</span>
                  <span class="block truncate text-xs text-muted-foreground">{r.status === "Open" ? `By @${r.reporter.username}` : statusText(r)}</span>
                </span>
                <span class="text-xs text-muted-foreground">{ago(at(r.status === "Open" ? r.createdAt : r.reviewedAt!))}</span>
              </a>
            </li>
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
          <h2 class="text-[22px] font-bold tracking-tight">{r.targetType} by @{preview?.author ?? "someone"}, reported as {r.reason.toLowerCase()}</h2>
          <p class="text-[13px] text-muted-foreground">Reported by @{r.reporter.username} · {ago(at(r.createdAt))}{sameTarget > 1 ? ` · ${sameTarget} open reports on this ${r.targetType.toLowerCase()}` : ""}</p>
        </header>
        {#if r.note}<p class="rounded-xl border border-border bg-card px-4 py-3 text-sm"><span class="text-muted-foreground">Their note:</span> {r.note}</p>{/if}
        <article class="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-5">
          {#if preview}
            <div class="flex items-center gap-3"><Avatar name={preview.author} size={36} /><span class="text-sm">@{preview.author}</span></div>
            <p class="whitespace-pre-wrap text-[15px] leading-relaxed {preview.deleted ? 'text-muted-foreground line-through' : ''}">{preview.body}</p>
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
            <button type="button" class="{btn} bg-destructive font-semibold text-white" disabled={busy || !preview || preview.deleted} onclick={() => resolve(r, "delete-target")}>Delete {r.targetType.toLowerCase()}</button>
            <button type="button" class="{btn} bg-muted hover:bg-accent" disabled={busy} onclick={() => resolve(r, "dismiss")}>Dismiss report</button>
            {#if author}<a href="/admin/people?id={author.id}" class="{btn} ml-auto bg-muted hover:bg-accent">Open @{author.username}'s page</a>{/if}
          </div>
          <div class="flex flex-col gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
            <p><strong class="font-medium text-foreground">Delete</strong> removes it for everyone and closes {sameTarget > 1 ? "every open report on it" : "the report"}. Logit doesn't tell @{preview?.author ?? "the author"}.</p>
            <p><strong class="font-medium text-foreground">Dismiss</strong> keeps it and closes {sameTarget > 1 ? "every open report on it" : "the report"}. @{r.reporter.username} can still block @{preview?.author ?? "the author"} themselves.</p>
          </div>
        {:else}
          <p class="text-[13px] text-muted-foreground">{statusText(r)} {r.reviewedAt ? ago(at(r.reviewedAt)) : ""}.</p>
        {/if}
      </div>
    {/if}
  </section>
</div>
