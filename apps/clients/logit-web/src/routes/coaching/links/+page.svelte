<!-- Your coaching › Invite links (canvas L1, V3). Each link opens your profile with Ask to be
     coached (or, pay and start, straight to paying); make one per place so you know where people
     came from. Trying Studio, links are real but not live yet: Copy and QR wait for Studio, and
     "Try it as Niamh" shows what a request through it looks like. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi, linkUrl, type CoachingRequest, type InviteLink } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import type { CoachPackage } from "@logit/core/domain/coachPayments";
  import { sampleAsksThrough } from "@logit/core/guide/sandboxDriver";
  import { inView } from "$lib/features/coaching/coachingData";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { ago, shortDate } from "$lib/features/coaching/format";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import { onSampleActivity, sandbox } from "$lib/features/guide/sandbox.svelte";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import LinkDialog from "$lib/features/coaching/links/LinkDialog.svelte";
  import LinkQr from "$lib/features/coaching/links/LinkQr.svelte";
  import { coachTrial } from "$lib/workspace";

  const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
  const me = apiClient.getUser();
  const coachName = me?.displayName || me?.username || "you";

  let links = $state<InviteLink[]>([]);
  let requests = $state<CoachingRequest[]>([]);
  let packages = $state<CoachPackage[]>([]);
  let paymentsReady = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let editing = $state<InviteLink | null>(null);
  let dialogOpen = $state(false);
  let qrFor = $state<string | null>(null);
  let trying = $state<string | null>(null);

  async function load() {
    try {
      const [l, r, payments] = await Promise.all([
        coachApi.listLinks(),
        coachTrial() ? Promise.resolve([] as CoachingRequest[]) : coachApi.listRequests().catch(() => [] as CoachingRequest[]),
        coachPaymentsApi.overview().catch(() => null),
      ]);
      links = l;
      // Only the ones waiting for an answer; offers out and the waiting list live in Clients.
      requests = inView(r).filter((x) => (x.stage ?? "asked") === "asked");
      packages = payments?.packages.filter((p) => !p.hidden) ?? [];
      paymentsReady = payments?.account.ready ?? false;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your links";
    } finally {
      loading = false;
    }
  }
  onMount(load);
  onMount(() => onSampleActivity(() => void load()));

  const urlOf = (l: InviteLink) =>
    linkUrl(l, me?.username ?? "", { webOrigin: location.origin, marketingUrl: MARKETING_URL, selfHosted: apiClient.isSelfHosted() });

  async function copy(l: InviteLink) {
    try {
      await navigator.clipboard.writeText(urlOf(l));
      toast.success("Link copied");
    } catch {
      toast.message(urlOf(l));
    }
  }

  async function setOn(l: InviteLink, on: boolean) {
    try {
      const saved = await coachApi.editLink(l.id, {
        name: l.name, expiresAt: l.expiresAt, maxUses: l.maxUses, packageId: l.packageId ?? null, payAndStart: !!l.payAndStart, on,
      });
      links = links.map((x) => (x.id === l.id ? saved : x));
      toast.success(on ? `"${l.name}" works again` : `"${l.name}" is off. People who asked through it stay.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    }
  }

  async function tryAsNiamh(l: InviteLink) {
    trying = l.id;
    try {
      const who = await sampleAsksThrough(l.code);
      if (!who) {
        toast.message("Niamh has asked already. Find her in Clients › Requests, in Practice view.");
        return;
      }
      sandbox.notify();
      toast.success(`${who} asked through "${l.name}". It's in Clients › Requests, in Practice view.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      trying = null;
    }
  }

  function line(l: InviteLink): string {
    const bits: string[] = [];
    if (l.state === "off") bits.push("Switched off · opens your profile without a package");
    else if (l.state === "expired") bits.push(`Ended ${shortDate(Date.parse(l.expiresAt!))}`);
    else if (l.state === "full") bits.push("Full");
    if (l.packageName && l.state !== "off") bits.push(l.payAndStart ? l.packageName : `${l.packageName} picked`);
    else if (l.state === "active") bits.push("no package picked");
    if (l.maxUses && l.state === "active") bits.push(`max ${l.maxUses} people · ${Math.max(0, l.maxUses - l.joined - l.waiting)} left`);
    if (l.expiresAt && l.state === "active") bits.push(`ends ${shortDate(Date.parse(l.expiresAt))}`);
    return bits.join(" · ");
  }

  const actionsFor = (l: InviteLink): RowAction[] => {
    const notLive = l.live === false ? "Not live until Studio" : undefined;
    return [
      { id: "copy", label: "Copy link", run: () => void copy(l), disabled: notLive ?? (l.state === "off" ? "Switched off" : undefined) },
      { id: "qr", label: "QR code", run: () => (qrFor = qrFor === l.id ? null : l.id), disabled: notLive },
      { id: "edit", label: "Edit…", run: () => { editing = l; dialogOpen = true; }, separatorBefore: true },
      l.state === "off"
        ? { id: "on", label: "Switch on again", run: () => void setOn(l, true) }
        : { id: "off", label: "Switch off", run: () => void setOn(l, false), danger: true, separatorBefore: true },
    ];
  };
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="max-w-xl">
      <h1 class="text-[26px] font-bold tracking-tight">Invite links</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">Each link opens your profile with Ask to be coached. Make one per place so you know where people came from.</p>
    </div>
    <Button data-guide="links-new" onclick={() => { editing = null; dialogOpen = true; }}>New link</Button>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <Skeleton class="h-64" />
  {:else}
    {#if requests.length}
      <!-- Answering happens in Clients › Requests (canvas C1): read their answers, then offer a spot. -->
      <section class="flex flex-col gap-2.5 rounded-[10px] border border-warning/30 bg-card px-[18px] py-4">
        <div class="flex items-baseline justify-between"><h2 class="text-sm font-semibold">Requests waiting</h2><span class="text-xs text-muted-foreground">{requests.length}</span></div>
        {#each requests as r (r.relationshipId)}
          {@const who = r.client.displayName || r.client.username}
          <div class="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
            <Avatar name={who} url={r.client.avatarUrl} />
            <span class="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
              <span class="text-[13px] font-medium">{#if r.client.isSample}{who}<SampleBadge />{:else}{who} · @{r.client.username}{/if}</span>
              <span class="text-xs text-muted-foreground">Via {r.linkName ? `"${r.linkName}"` : "your profile"} · {ago(Date.parse(r.requestedAt))}</span>
            </span>
            <Button size="sm" href="/clients?tab=requests&r={r.relationshipId}">Answer</Button>
          </div>
        {/each}
      </section>
    {/if}

    {#if links.some((l) => l.live === false)}
      <p class="rounded-[10px] bg-muted px-4 py-3 text-[13px]">
        <b class="font-semibold">Not live yet.</b> You're trying Studio with sample clients: your links are real, and everything you set up is kept. Copy and QR switch on with Studio; until then, someone opening a link sees that you aren't taking clients through LogIt yet.
      </p>
    {/if}

    <section data-guide="links-table" class="flex flex-col gap-2" aria-label="Your links">
      {#each links as l (l.id)}
        {@const notLive = l.live === false}
        <ActionMenu actions={actionsFor(l)} label="More for {l.name}">
          {#snippet children({ props, more })}
            <article {...props} class="flex flex-col gap-3 rounded-[12px] border border-border bg-card px-4 py-3.5 data-[state=open]:bg-muted/40 {l.state === 'off' ? 'opacity-75' : ''}">
              <div class="flex flex-wrap items-start gap-3">
                <div class="flex min-w-0 flex-[1_1_280px] flex-col gap-0.5">
                  <h2 class="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    {l.name}
                    {#if notLive}<Badge variant="outline">Not live yet</Badge>{/if}
                    {#if l.payAndStart}<Badge variant="secondary">Pays and starts straight away</Badge>{/if}
                  </h2>
                  <p class="truncate font-mono text-xs text-muted-foreground">{urlOf(l).replace(/^https?:\/\//, "")}</p>
                  <p class="text-xs text-muted-foreground">{line(l)}</p>
                </div>
                <p class="text-[13px] tabular-nums">{l.payAndStart ? `${l.joined} paid` : `${l.asked ?? 0} asked · ${l.joined} ${l.joined === 1 ? "client" : "clients"}`}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                {#if notLive}
                  <Button size="sm" disabled={trying === l.id} onclick={() => void tryAsNiamh(l)}>{trying === l.id ? "Asking…" : "Try it as Niamh"}</Button>
                {/if}
                <Button size="sm" variant="outline" disabled={notLive || l.state === "off"} title={notLive ? "Copy switches on with Studio" : undefined} onclick={() => void copy(l)}>Copy</Button>
                <Button size="sm" variant="outline" disabled={notLive} aria-expanded={qrFor === l.id} onclick={() => (qrFor = qrFor === l.id ? null : l.id)}>QR code</Button>
                {#if notLive}<span class="text-xs text-muted-foreground">Copy and QR switch on with Studio.</span>{/if}
                <span class="ml-auto">{@render more()}</span>
              </div>
              {#if qrFor === l.id && !notLive}
                <LinkQr url={urlOf(l)} name={l.name} coach={coachName} />
              {/if}
            </article>
          {/snippet}
        </ActionMenu>
      {:else}
        <p class="rounded-[10px] border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">No links yet. Make one for your bio, a chat or a poster.</p>
      {/each}
      <p class="text-xs text-muted-foreground">"Asked" counts requests through the link, not clicks: LogIt doesn't track who opens a link.</p>
    </section>
  {/if}
</div>

<LinkDialog bind:open={dialogOpen} link={editing} {packages} {paymentsReady} onsaved={(saved) => {
  links = links.some((x) => x.id === saved.id) ? links.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...links];
  if (!editing) qrFor = saved.id;
}} />
