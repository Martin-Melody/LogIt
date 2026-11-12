<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { ChevronRight } from "lucide-svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import {
    clearLog,
    formatLog,
    getLogEntries,
    isVerbose,
    log,
    onLogChange,
    setVerbose,
    type LogEntry,
  } from "@logit/core/platform/log";
  import { apiClient } from "@logit/core/api/client";
  import { diagnosticsApi, MAX_REPORT_LOG_CHARS } from "@logit/core/api/diagnosticsApi";
  import { saveTextFile } from "$lib/platform/fileSave";
  import { getDeviceInfo, deviceInfoHeader, type DeviceInfo } from "$lib/platform/deviceInfo";
  import { lastSyncedAt } from "$lib/sync/syncService";
  import { outboxSummary } from "$lib/sync/outbox";

  const PAGE = 150;

  let entries = $state<LogEntry[]>(getLogEntries());
  let filter = $state<"problems" | "all">("problems");
  let shown = $state(PAGE);
  let verbose = $state(isVerbose());
  let info = $state<DeviceInfo | null>(null);
  let queued = $state<Record<string, number>>({});
  let confirmingClear = $state(false);
  let note = $state("");
  let sending = $state(false);
  let sentRef = $state<string | null>(null);

  const visible = $derived(
    entries
      .filter((e) => filter === "all" || e.level === "warn" || e.level === "error")
      .reverse(),
  );
  const problemCount = $derived(entries.filter((e) => e.level === "warn" || e.level === "error").length);
  const queuedTotal = $derived(Object.values(queued).reduce((a, b) => a + b, 0));

  /** Sending is offered only for an account on the hosted service. Offline and self-hosted
   * logs never leave the device (a self-hosted server also refuses reports). */
  const canSend = $derived(
    !!info && info.serverMode === "cloud" && info.signedIn && !apiClient.isSelfHosted(),
  );

  onMount(() => {
    void getDeviceInfo().then((i) => (info = i));
    queued = outboxSummary();
    return onLogChange(() => {
      entries = getLogEntries();
    });
  });

  function time(ms: number): string {
    const d = new Date(ms);
    const sameDay = d.toDateString() === new Date().toDateString();
    const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return sameDay ? t : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${t}`;
  }

  function lastSync(ms: number): string {
    return ms ? new Date(ms).toLocaleString() : "Never";
  }

  async function exportText(): Promise<string> {
    const i = info ?? (await getDeviceInfo());
    return formatLog({
      ...deviceInfoHeader(i),
      "Last synced": $lastSyncedAt ? new Date($lastSyncedAt).toISOString() : "never",
      "Waiting to upload": queuedTotal ? JSON.stringify(queued) : "nothing",
      "Detailed logging": verbose ? "on" : "off",
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(await exportText());
      toast.success("Log copied");
    } catch (e) {
      log.warn("diagnostics", "Copy to clipboard failed", e);
      toast.error("Couldn't copy. Try Save file instead.");
    }
  }

  async function save() {
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      await saveTextFile(`logit-log-${stamp}.txt`, await exportText(), "text/plain");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("cancel")) {
        log.warn("diagnostics", "Saving the log failed", e);
        toast.error("Couldn't save the log file.");
      }
    }
  }

  function clear() {
    if (!confirmingClear) {
      confirmingClear = true;
      setTimeout(() => (confirmingClear = false), 4000);
      return;
    }
    confirmingClear = false;
    clearLog();
    shown = PAGE;
    toast.success("Log cleared");
  }

  function toggleVerbose(on: boolean) {
    verbose = on;
    setVerbose(on);
    log.info("diagnostics", on ? "Detailed logging turned on" : "Detailed logging turned off");
  }

  async function send() {
    if (sending || !info) return;
    sending = true;
    try {
      let text = await exportText();
      // Keep the newest part if it's somehow over the server's limit.
      if (text.length > MAX_REPORT_LOG_CHARS) text = text.slice(text.length - MAX_REPORT_LOG_CHARS);
      const { id } = await diagnosticsApi.sendReport({
        note: note.trim(),
        appVersion: `${info.appVersion}, build ${info.build}`,
        platform: info.platform,
        log: text,
      });
      sentRef = id.slice(0, 8);
      note = "";
      log.info("diagnostics", "Report sent", { ref: sentRef });
    } catch (e) {
      toast.error("Couldn't send the report. Check your connection, or save the file and send it yourself.");
    } finally {
      sending = false;
    }
  }

  const levelClass: Record<LogEntry["level"], string> = {
    debug: "text-muted-foreground",
    info: "text-sky-600 dark:text-sky-400",
    warn: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  };
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/settings")} />
    <h1 class="page-title">Diagnostics</h1>
  </PageHeader>

  <Card.Root>
    <Card.Header>
      <Card.Title>This device</Card.Title>
      <Card.Description>
        The app keeps a log of what it did and what went wrong (the newest 1,000 entries), so a
        problem can be tracked down afterwards. It stays on this device. It doesn't contain your
        workouts, food, messages or password.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt class="text-muted-foreground">App</dt>
        <dd class="min-w-0 break-words">{info ? `${info.appVersion}, build ${info.build}` : "…"}</dd>
        <dt class="text-muted-foreground">Platform</dt>
        <dd>{info?.platform ?? "…"}</dd>
        <dt class="text-muted-foreground">Server</dt>
        <dd class="min-w-0 break-words">
          {#if !info}…
          {:else if info.serverMode === "offline"}None (offline only)
          {:else if info.serverMode === "selfhosted"}Self-hosted ({info.server})
          {:else}Logit cloud{/if}
        </dd>
        {#if info && info.serverMode !== "offline"}
          <dt class="text-muted-foreground">Signed in</dt>
          <dd>{info.signedIn ? `Yes${info.tier ? `, ${info.tier}` : ""}` : "No"}</dd>
          <dt class="text-muted-foreground">Last synced</dt>
          <dd>{lastSync($lastSyncedAt)}</dd>
          <dt class="text-muted-foreground">Waiting to upload</dt>
          <dd>
            {#if queuedTotal === 0}Nothing
            {:else}
              {queuedTotal} change{queuedTotal === 1 ? "" : "s"}
              <span class="text-muted-foreground">
                ({Object.entries(queued).map(([t, n]) => `${n} ${t}`).join(", ")})
              </span>
            {/if}
          </dd>
        {/if}
      </dl>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Log</Card.Title>
      <Card.Description>Times are in your time zone. Tap an entry for its details.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-3">
      <label class="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <p class="text-sm font-medium">Detailed logging</p>
          <p class="text-xs text-muted-foreground">
            Also record every request and sync step. Turn it on before repeating a problem.
          </p>
        </div>
        <Switch checked={verbose} label="Detailed logging" onchange={toggleVerbose} />
      </label>

      <div class={segmentTrack}>
        <button type="button" class={segment(filter === "problems")} aria-pressed={filter === "problems"}
          onclick={() => { filter = "problems"; shown = PAGE; }}>
          Problems ({problemCount})
        </button>
        <button type="button" class={segment(filter === "all")} aria-pressed={filter === "all"}
          onclick={() => { filter = "all"; shown = PAGE; }}>
          Everything ({entries.length})
        </button>
      </div>

      {#if visible.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">
          {filter === "problems" ? "No problems logged." : "The log is empty."}
        </p>
      {:else}
        <ul class="-mx-1 flex flex-col divide-y divide-border">
          {#each visible.slice(0, shown) as e}
            <li>
              <details class="group px-1 py-1.5">
                <summary class="flex min-h-11 cursor-pointer list-none items-start gap-2 text-xs [&::-webkit-details-marker]:hidden">
                  <span class={cn("w-10 shrink-0 pt-0.5 font-mono font-semibold uppercase", levelClass[e.level])}>{e.level}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block break-words font-medium text-foreground">
                      {e.msg}{#if e.n && e.n > 1}<span class="ml-1 text-muted-foreground">×{e.n}</span>{/if}
                    </span>
                    <span class="block text-muted-foreground">{e.area} · {time(e.tLast ?? e.t)}</span>
                  </span>
                  {#if e.data}
                    <ChevronRight class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  {/if}
                </summary>
                {#if e.data || (e.n && e.n > 1)}
                  <pre class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] leading-snug">{#if e.n && e.n > 1}First: {new Date(e.t).toLocaleString()}
Last: {new Date(e.tLast ?? e.t).toLocaleString()}
{/if}{e.data ? JSON.stringify(e.data, null, 2) : ""}</pre>
                {/if}
              </details>
            </li>
          {/each}
        </ul>
        {#if visible.length > shown}
          <Button variant="ghost" size="sm" onclick={() => (shown += PAGE)}>
            Show older ({visible.length - shown} more)
          </Button>
        {/if}
      {/if}

      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={copy}>Copy</Button>
        <Button variant="outline" size="sm" onclick={save}>Save file</Button>
        <Button variant={confirmingClear ? "destructive" : "ghost"} size="sm" class="ml-auto" onclick={clear}>
          {confirmingClear ? "Tap again to clear" : "Clear"}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  {#if canSend}
    <Card.Root>
      <Card.Header>
        <Card.Title>Send to Logit</Card.Title>
        <Card.Description>
          Something not working? Send this log and the device details above to the Logit team.
          It's linked to your account so we can look into it, and deleted after 30 days.
        </Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-3">
        {#if sentRef}
          <p class="text-sm">
            Sent, thank you. If you contact us about it, mention reference
            <span class="font-mono font-semibold">{sentRef}</span>.
          </p>
          <Button variant="ghost" size="sm" class="w-fit" onclick={() => (sentRef = null)}>Send another</Button>
        {:else}
          <Textarea bind:value={note} maxlength={2000} rows={3}
            placeholder="What happened? (optional) e.g. my workout from this morning isn't on my other phone" />
          <Button class="w-fit" disabled={sending} onclick={send}>{sending ? "Sending…" : "Send report"}</Button>
        {/if}
      </Card.Content>
    </Card.Root>
  {:else if info}
    <p class="px-1 text-xs text-muted-foreground">
      {#if info.serverMode === "cloud" && !info.signedIn}
        Sign in to send this log to the Logit team, or save the file and send it yourself.
      {:else}
        Nothing here is sent anywhere. To share it, use Copy or Save file.
      {/if}
    </p>
  {/if}
</div>
