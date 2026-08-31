<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { coachApi, type RosterEntry } from "@logit/core/api/coachApi";

  let loading = $state(true);
  let error = $state<string | null>(null);
  let roster = $state<RosterEntry[]>([]);

  const DAY = 86_400_000;

  function daysSince(ms: number | null): number {
    return ms == null ? Infinity : (Date.now() - ms) / DAY;
  }

  type Status = "red" | "amber" | "green";

  /** Training + check-in adherence only. Unread messages are shown separately. */
  function statusOf(e: RosterEntry): Status {
    const since = daysSince(e.lastSessionAtMs);
    if (since > 14) return "red";
    if (e.checkinScheduleCount > 0) {
      const ck = daysSince(e.lastCheckinSubmittedAtMs);
      if (ck > 10) return "red";
      if (ck > 8) return "amber";
    }
    if (since > 7) return "amber";
    return "green";
  }

  const STATUS_RANK: Record<Status, number> = { red: 0, amber: 1, green: 2 };

  const rows = $derived(
    [...roster]
      .map((e) => ({ e, status: statusOf(e) }))
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          b.e.unreadFromClient - a.e.unreadFromClient ||
          (a.e.client.displayName || a.e.client.username).localeCompare(
            b.e.client.displayName || b.e.client.username,
          ),
      ),
  );

  const counts = $derived({
    red: rows.filter((r) => r.status === "red").length,
    amber: rows.filter((r) => r.status === "amber").length,
    green: rows.filter((r) => r.status === "green").length,
  });

  const dotClass: Record<Status, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    green: "bg-emerald-500",
  };

  function ago(ms: number | null): string {
    if (ms == null) return "—";
    const d = Math.floor(daysSince(ms));
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 14) return `${d}d ago`;
    if (d < 60) return `${Math.floor(d / 7)}w ago`;
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  async function load() {
    loading = true;
    error = null;
    try {
      roster = await coachApi.getRoster();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load roster";
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold">Roster</h1>
    {#if !loading && roster.length > 0}
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-red-500"></span>{counts.red} need attention</span>
        <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-amber-500"></span>{counts.amber}</span>
        <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-emerald-500"></span>{counts.green}</span>
      </div>
    {/if}
  </div>

  {#if error}
    <Alert.Root variant="destructive">
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  <Card.Root>
    <Card.Content class="p-0">
      {#if loading}
        <div class="flex flex-col gap-2 p-3">
          {#each Array.from({ length: 5 }) as _, i (i)}
            <Skeleton class="h-8 w-full" />
          {/each}
        </div>
      {:else if roster.length === 0}
        <p class="text-sm text-muted-foreground p-4">No active clients yet.</p>
      {:else}
        <div class="overflow-x-auto">
          <Table.Root class="text-sm">
            <Table.Header>
              <Table.Row class="text-xs text-muted-foreground">
                <Table.Head>Client</Table.Head>
                <Table.Head>Last workout</Table.Head>
                <Table.Head class="text-right">7d</Table.Head>
                <Table.Head class="text-right">28d</Table.Head>
                <Table.Head class="text-right">Programs</Table.Head>
                <Table.Head>Last check-in</Table.Head>
                <Table.Head class="text-right">Unread</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each rows as { e, status } (e.relationshipId)}
                <Table.Row class="hover:bg-muted/40">
                  <Table.Cell>
                    <a
                      href="/clients/{e.client.id}?u={e.client.username}"
                      class="flex items-center gap-2 font-medium hover:underline"
                    >
                      <span class="size-2 rounded-full shrink-0 {dotClass[status]}"></span>
                      {e.client.displayName || e.client.username}
                    </a>
                  </Table.Cell>
                  <Table.Cell class="tabular-nums {daysSince(e.lastSessionAtMs) > 14 ? 'text-red-600 dark:text-red-400' : ''}">
                    {ago(e.lastSessionAtMs)}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">{e.sessions7d}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums text-muted-foreground">{e.sessions28d}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums text-muted-foreground">{e.programCount || "—"}</Table.Cell>
                  <Table.Cell class="tabular-nums">
                    {#if e.checkinScheduleCount === 0}
                      <span class="text-muted-foreground">no check-in</span>
                    {:else}
                      {ago(e.lastCheckinSubmittedAtMs)}
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    {#if e.unreadFromClient > 0}
                      <Badge class="text-xs px-1.5 py-0">{e.unreadFromClient}</Badge>
                    {:else}
                      <span class="text-muted-foreground">—</span>
                    {/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
