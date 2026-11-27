<!-- Clients › Requests and Clients › Waiting list (canvas C1, C4, C6): the list on the left, the
     picked request on the right. Requests has Open and Closed; every row has the same actions
     in its ⋯ menu, on right-click and from ⌘K (requestActions). Nobody on the waiting list is
     offered a spot automatically: the coach picks who fits. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { ClosedRequest, CoachingRequest } from "@logit/core/api/coachApi";
  import { offerStateNow, requestLine, type RequestStage } from "@logit/core/domain/coachRequest";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { ago, shortDate } from "$lib/features/coaching/format";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import { requestActions } from "$lib/features/commands/commands.svelte";
  import RequestPane from "./RequestPane.svelte";

  let {
    mode,
    requests,
    closed,
    packages,
    expectSpots = null,
    onchange,
    onEditIntake,
  }: {
    mode: "requests" | "waiting";
    requests: CoachingRequest[];
    closed: ClosedRequest[];
    /** Package names by id ("interested in"). */
    packages: Record<string, string>;
    expectSpots?: string | null;
    onchange: () => Promise<void> | void;
    onEditIntake?: () => void;
  } = $props();

  let view = $state<"open" | "closed">(page.url.searchParams.get("view") === "closed" ? "closed" : "open");
  let dialog = $state<"offer" | "waitlist" | "notafit" | "withdraw" | null>(null);
  const now = Date.now();

  const open = $derived(requests.filter((r) => (mode === "waiting" ? r.stage === "waiting" : r.stage !== "waiting")));
  const rows = $derived(
    mode === "requests" && view === "closed"
      ? closed.map((r) => ({ kind: "closed" as const, r }))
      : open.map((r) => ({ kind: "open" as const, r })),
  );
  let selectedId = $state<string | null>(page.url.searchParams.get("r"));
  const selected = $derived(rows.find((x) => x.r.relationshipId === selectedId) ?? rows[0] ?? null);

  function pick(id: string, then?: typeof dialog) {
    selectedId = id;
    dialog = then ?? null;
    const u = new URL(page.url);
    u.searchParams.set("r", id);
    void goto(u, { replaceState: true, keepFocus: true, noScroll: true });
  }

  function stageOf(x: (typeof rows)[number]): RequestStage {
    return x.kind === "closed" ? x.r.stage : (x.r.stage ?? "asked");
  }
  const nameOf = (x: (typeof rows)[number]) => x.r.client.displayName || x.r.client.username;

  function line(x: (typeof rows)[number]): string {
    if (x.kind === "closed") return `${x.r.stage === "withdrawn" ? "Withdrawn" : "Not a fit"} · ${shortDate(Date.parse(x.r.closedAt))}`;
    const r = x.r;
    if (mode === "waiting") {
      const bits = (r.answers ?? []).slice(0, 3).map((a) => a.value.split("\n")[0]!.slice(0, 40));
      return `Waiting since ${shortDate(Date.parse(r.waitingSince ?? r.requestedAt))}${bits.length ? ` · ${bits.join(", ")}` : ""}`;
    }
    const state = requestLine(r.stage ?? "asked", r.offer ?? null, now);
    return `${r.linkName ? `Via "${r.linkName}" · ` : ""}${ago(Date.parse(r.requestedAt))} · ${state}`;
  }

  const actionsFor = (x: (typeof rows)[number]) =>
    requestActions(
      { relationshipId: x.r.relationshipId, name: nameOf(x), stage: stageOf(x), offer: x.kind === "open" ? (x.r.offer ?? null) : null },
      {
        offer: () => pick(x.r.relationshipId, "offer"),
        waitlist: () => pick(x.r.relationshipId, "waitlist"),
        notAFit: () => pick(x.r.relationshipId, "notafit"),
        withdrawOffer: () => pick(x.r.relationshipId, "withdraw"),
        reopen: () => pick(x.r.relationshipId),
      },
    );
</script>

<div class="flex flex-col gap-3">
  {#if mode === "requests"}
    <Tabs.Root value={view} onValueChange={(v) => { view = v as typeof view; selectedId = null; }}>
      <Tabs.List aria-label="Requests">
        <Tabs.Trigger value="open">Open <span class="opacity-60">{open.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="closed">Closed <span class="opacity-60">{closed.length}</span></Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  {:else}
    <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card px-4 py-3 text-[13px]">
      <span><span class="text-muted-foreground">Expect spots</span> <b class="font-semibold">{expectSpots ?? "Not said"}</b></span>
      <span class="text-xs text-muted-foreground">Shown on your profile when you're full, and to people waiting.</span>
      {#if onEditIntake}<Button variant="outline" size="sm" class="ml-auto" onclick={onEditIntake}>Change</Button>{/if}
    </div>
  {/if}

  {#if rows.length === 0}
    <p class="rounded-[10px] border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
      {mode === "waiting" ? "Nobody's waiting. When you're full, people who ask can join your waiting list."
        : view === "closed" ? "No closed requests." : "No requests right now. People ask from your profile or an invite link."}
    </p>
  {:else}
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
      <ul class="flex flex-col gap-1 lg:w-[320px] lg:shrink-0" aria-label={mode === "waiting" ? "Waiting list" : "Requests"}>
        {#each rows as x (x.r.relationshipId)}
          {@const isSel = selected?.r.relationshipId === x.r.relationshipId}
          <ActionMenu actions={actionsFor(x)} label="More for {nameOf(x)}">
            {#snippet children({ props, more })}
              <li {...props} class="group flex items-center gap-2 rounded-[10px] border px-2 py-1.5 transition-colors data-[state=open]:bg-muted {isSel ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/60'}">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left" aria-current={isSel ? "true" : undefined} onclick={() => pick(x.r.relationshipId)}>
                  <Avatar name={nameOf(x)} url={x.r.client.avatarUrl} size={34} />
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate text-[13px] font-medium">{nameOf(x)}{#if x.r.client.isSample}<SampleBadge />{/if}</span>
                    <span class="truncate text-xs text-muted-foreground">{line(x)}</span>
                  </span>
                </button>
                {#if mode === "waiting" && x.kind === "open"}
                  <Button size="sm" variant="outline" class="shrink-0" onclick={() => pick(x.r.relationshipId, "offer")}>Offer a spot</Button>
                {:else if x.kind === "open" && x.r.offer && offerStateNow(x.r.offer, now) === "expired"}
                  <Button size="sm" variant="outline" class="shrink-0" onclick={() => pick(x.r.relationshipId, "offer")}>Offer again</Button>
                {/if}
                {@render more()}
              </li>
            {/snippet}
          </ActionMenu>
        {/each}
      </ul>
      {#if selected}
        <div data-guide="requests-pane" class="min-w-0 flex-1 rounded-[12px] border border-border bg-card p-5">
          {#key selected.r.relationshipId}
            <RequestPane item={selected} bind:dialog onchange={onchange}
              packageName={selected.kind === "open" && selected.r.interestedPackageId ? (packages[selected.r.interestedPackageId] ?? null) : null} />
          {/key}
        </div>
      {/if}
    </div>
  {/if}
</div>
