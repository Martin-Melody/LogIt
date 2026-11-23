<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { ago, when } from "$lib/features/coaching/format";
  import { adminApi, at, type DiagnosticsRow } from "$lib/features/admin/adminApi";

  let reports = $state<DiagnosticsRow[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let report = $state<(DiagnosticsRow & { log: string }) | null>(null);
  let reportError = $state<string | null>(null);
  let problemsOnly = $state(true);
  let search = $state("");

  const selectedId = $derived(page.url.searchParams.get("id") ?? reports[0]?.id ?? null);

  async function load() {
    try {
      reports = (await adminApi.diagnostics()).reports;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load diagnostics";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  // Opening a report is recorded in the admin log (the server does it).
  $effect(() => {
    const id = selectedId;
    report = null;
    reportError = null;
    if (!id) return;
    void adminApi.diagnosticsReport(id).then((r) => { if (selectedId === id) report = r; })
      .catch((e) => { reportError = e instanceof Error ? e.message : "Couldn't open this report"; });
  });

  // Lines look like "2026-11-18T18:41:03Z ERROR api      POST /sync/sessions 500 {…}" (formatLogEntry).
  const isProblem = (line: string) => /^\S+ (ERROR|WARN)\s/.test(line);
  const lines = $derived.by(() => {
    if (!report) return [];
    const all = report.log.split("\n");
    const q = search.trim().toLowerCase();
    return all.filter((l) => (!problemsOnly || isProblem(l)) && (!q || l.toLowerCase().includes(q)));
  });
  const problemCount = $derived(report ? report.log.split("\n").filter(isProblem).length : 0);
  // A request that failed on the server can be found in its log by this id.
  const requestIds = $derived([...new Set(lines.filter((l) => / 5\d\d /.test(l)).flatMap((l) => [...l.matchAll(/"requestId":"([A-Za-z0-9_-]{1,64})"/g)].map((m) => m[1])))].slice(0, 3));

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.log);
      toast.success("Log copied");
    } catch {
      toast.error("Couldn't copy. Select the log and copy it yourself.");
    }
  }

  async function remove(r: DiagnosticsRow) {
    try {
      await adminApi.deleteDiagnostics(r.id);
      toast.success("Report deleted");
      await load();
      await goto("/admin/diagnostics", { replaceState: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the report");
    }
  }

  /** Whose report it is: "Crash · sam", "Crash · no account", or the username for a sent report. */
  const who = (r: DiagnosticsRow) =>
    r.kind === "crash" ? `Crash · ${r.user?.username ?? "no account"}` : (r.user?.username ?? "no account");

  const btn = "inline-flex h-[34px] items-center whitespace-nowrap rounded-[9px] bg-muted px-3 text-[13px] font-medium hover:bg-accent disabled:opacity-50";
  const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-xs";
</script>

<div class="flex flex-wrap items-start gap-6">
  <section aria-label="Reports" class="min-w-0 flex-[1_1_300px] md:max-w-[360px] {page.url.searchParams.has('id') ? 'max-md:hidden' : ''}">
    <h1 class="text-[26px] font-bold tracking-tight">Diagnostics</h1>
    <p class="mb-3 text-[13px] text-muted-foreground">Logs people sent from Settings › About › Diagnostics. Deleted after 30 days.</p>
    {#if error}
      <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
    {:else if loading}
      <Skeleton class="h-48" />
    {:else}
      <ul>
        {#each reports as r (r.id)}
          <li>
            <a href="/admin/diagnostics?id={r.id}" aria-current={selectedId === r.id ? "page" : undefined}
              class="block rounded-lg px-3 py-2.5 hover:bg-muted {selectedId === r.id ? 'bg-muted' : ''}">
              <span class="flex justify-between gap-3 text-sm font-medium"><span class="truncate">{who(r)}</span><span class="shrink-0 text-xs font-normal text-muted-foreground">{when(at(r.createdAt))}</span></span>
              <span class="block truncate text-[13px] text-muted-foreground">{r.platform} · {r.appVersion}{r.note ? ` · "${r.note}"` : ""}</span>
            </a>
          </li>
        {:else}
          <li class="px-3 py-3 text-[13px] text-muted-foreground">No reports. People can send one from the app's Settings › About › Diagnostics; test builds send crashes by themselves.</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-label="Report" class="min-w-0 flex-[999_1_520px] {page.url.searchParams.has('id') ? '' : 'max-md:hidden'}">
    {#if reportError}
      <Alert.Root variant="destructive"><Alert.Description>{reportError}</Alert.Description></Alert.Root>
    {:else if selectedId && !report}
      <Skeleton class="h-96" />
    {:else if report}
      {@const r = report}
      <div class="flex flex-col gap-3.5">
        <a href="/admin/diagnostics" class="{btn} self-start md:hidden"><ArrowLeftIcon class="mr-1.5 size-4" />All reports</a>
        <div class="flex flex-wrap items-start gap-2.5">
          <div class="min-w-0 flex-[1_1_300px]">
            <h2 class="text-[22px] font-bold tracking-tight">{who(r)}, {when(at(r.createdAt), Date.now(), true)}</h2>
            <p class="text-[13px] text-muted-foreground">{r.platform} · app {r.appVersion}{#if r.deviceId} · phone {r.deviceId.slice(0, 6)}{/if}{#if r.user} · <a href="/admin/people?id={r.user.id}" class="text-primary hover:underline">their page</a>{/if}</p>
          </div>
          <button type="button" class={btn} onclick={copy}>Copy log</button>
          <button type="button" class={btn} onclick={() => remove(r)}>Delete</button>
        </div>
        {#if r.note}<p class="rounded-xl border border-border bg-card px-3.5 py-3 text-sm"><span class="text-muted-foreground">Their note:</span> {r.note}</p>{/if}
        <div class="flex flex-wrap items-center gap-2">
          {#each [[true, `Problems only (${problemCount})`], [false, "Everything"]] as [value, text] (text)}
            <button type="button" aria-pressed={problemsOnly === value} onclick={() => (problemsOnly = value as boolean)}
              class="h-8 rounded-full px-3 text-xs transition-colors {problemsOnly === value ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}">{text}</button>
          {/each}
          <label for="log-search" class="sr-only">Search the log</label>
          <input id="log-search" type="search" bind:value={search} placeholder="Search the log, e.g. a request id" class="ml-auto h-8 min-w-0 flex-[0_1_300px] rounded-[9px] border border-input bg-background px-2.5 text-[13px]" />
        </div>
        <pre class="relative max-h-[520px] overflow-auto rounded-xl border border-border bg-card px-4 py-3 font-mono text-xs leading-relaxed">{#each lines as l, i (i)}<span class="block {/^\S+ ERROR\s/.test(l) ? 'bg-destructive/14' : /^\S+ WARN\s/.test(l) ? 'bg-warning/10' : ''}">{l}</span>{:else}<span class="text-muted-foreground">{problemsOnly ? "No errors or warnings in this log." : "Nothing matches."}</span>{/each}</pre>
        {#each requestIds as id (id)}
          <p class="rounded-xl border border-chart-1/30 bg-chart-1/10 px-3.5 py-3 text-[13px]">Request <code class={code}>{id}</code> failed on the server. On the server: <code class={code}>docker compose logs api | grep {id}</code></p>
        {/each}
      </div>
    {/if}
  </section>
</div>
