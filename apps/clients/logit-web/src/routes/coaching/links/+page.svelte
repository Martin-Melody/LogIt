<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity } from "$lib/features/guide/sandbox.svelte";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { coachApi, SHARE_AREAS, type CoachingRequest, type InviteLink } from "@logit/core/api/coachApi";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { ago, shortDate } from "$lib/features/coaching/format";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { priceText, type CoachPackage } from "@logit/core/domain/coachPayments";

  let links = $state<InviteLink[]>([]);
  let requests = $state<CoachingRequest[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let turningOff = $state<InviteLink | null>(null);

  let name = $state("");
  let expires = $state("");
  let maxUses = $state("");
  let packageId = $state("");
  let creating = $state(false);
  // Packages people can pay for through a link; empty until Stripe is connected.
  let packages = $state<CoachPackage[]>([]);
  let paymentsReady = $state(false);
  let formError = $state<string | null>(null);

  const me = apiClient.getUser();

  async function load() {
    try {
      const [l, r, payments] = await Promise.all([
        coachApi.listLinks(),
        coachApi.listRequests(),
        coachPaymentsApi.overview().catch(() => null),
      ]);
      links = l;
      requests = r;
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

  const url = (code: string) => `${location.origin}/c/${code}`;

  async function create(e: Event) {
    e.preventDefault();
    formError = null;
    const max = maxUses.trim() ? Number(maxUses) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) {
      formError = "Max people must be a whole number, or empty for no limit.";
      return;
    }
    creating = true;
    try {
      const link = await coachApi.createLink({
        name: name.trim(),
        expiresInDays: expires ? Number(expires) : null,
        maxUses: max,
        packageId: packageId || null,
      });
      links = [link, ...links];
      guideSignal("link.created");
      name = "";
      maxUses = "";
      expires = "";
      packageId = "";
      await copy(link);
    } catch (err) {
      formError = err instanceof ApiError ? err.message : "Couldn't create the link.";
    } finally {
      creating = false;
    }
  }

  async function copy(link: InviteLink) {
    try {
      await navigator.clipboard.writeText(url(link.code));
      toast.success("Link copied");
    } catch {
      toast.message(url(link.code));
    }
  }

  async function turnOff() {
    const link = turningOff;
    turningOff = null;
    if (!link) return;
    try {
      await coachApi.turnOffLink(link.id);
      links = links.map((l) => (l.id === link.id ? { ...l, state: "off" } : l));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn it off");
    }
  }

  async function answer(r: CoachingRequest, accept: boolean) {
    busy = r.relationshipId;
    try {
      if (accept) await coachApi.acceptRequest(r.relationshipId);
      else await coachApi.declineRequest(r.relationshipId);
      if (accept) guideSignal("request.accepted");
      toast.success(accept ? `${r.client.displayName || r.client.username} is now your client` : "Request declined");
      await load();
      void coachBadges.refresh(true, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = null;
    }
  }

  async function changePackage(link: InviteLink, id: string) {
    try {
      await coachPaymentsApi.setLinkPackage(link.id, id || null);
      const p = packages.find((x) => x.id === id);
      links = links.map((l) => (l.id === link.id ? { ...l, packageId: id || null, packageName: p?.name ?? null } : l));
      toast.success(id ? `People now pay for ${p?.name} through "${link.name}"` : `"${link.name}" is free again`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the package");
    }
  }

  function shares(r: CoachingRequest): string {
    const on = SHARE_AREAS.filter((a) => r.sharing[a.key]).map((a) => a.label.toLowerCase());
    return on.length ? `will share ${on.join(", ")}` : "shares nothing yet";
  }

  function peopleText(l: InviteLink): string {
    if (l.maxUses) return `${l.joined + l.waiting} of ${l.maxUses}`;
    return `${l.joined} joined${l.waiting ? ` · ${l.waiting} waiting` : ""}`;
  }

  const stateLabel = { off: "Turned off", expired: "Expired", full: "Full", active: "" } as const;
</script>

<div class="flex flex-col gap-4">
  <header>
    <h1 class="text-[26px] font-bold tracking-tight">Invite links</h1>
    <p class="mt-1 text-[13px] text-muted-foreground">Share a link in your bio, a group chat or on a poster. On a free link people ask you to coach them and nothing is shared until you accept. On a link with a package they pay first, then coaching starts.</p>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <Skeleton class="h-28" /><Skeleton class="h-56" />
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <div class="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        {#if requests.length}
          <section data-guide="links-requests" class="flex flex-col gap-2.5 rounded-[10px] border border-warning/30 bg-card px-[18px] py-4">
            <div class="flex items-baseline justify-between"><h2 class="text-sm font-semibold">Requests waiting</h2><span class="text-xs text-muted-foreground">{requests.length}</span></div>
            {#each requests as r (r.relationshipId)}
              {@const who = r.client.displayName || r.client.username}
              <div class="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
                <Avatar name={who} url={r.client.avatarUrl} />
                <span class="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                  <span class="text-[13px] font-medium">{#if r.client.isSample}{who}<SampleBadge />{:else}{who} · @{r.client.username}{/if}</span>
                  <span class="text-xs text-muted-foreground">Via {r.linkName ? `"${r.linkName}"` : "a link"} · {ago(Date.parse(r.requestedAt))} · {shares(r)}</span>
                </span>
                <span class="flex gap-2">
                  <button type="button" disabled={busy === r.relationshipId} onclick={() => answer(r, false)} class="h-[30px] rounded-lg border border-border px-2.5 text-xs hover:bg-background disabled:opacity-50">Decline</button>
                  <button type="button" disabled={busy === r.relationshipId} onclick={() => answer(r, true)} class="h-[30px] rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Accept</button>
                </span>
              </div>
            {/each}
          </section>
        {/if}

        <section data-guide="links-new" class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
          <h2 class="text-sm font-semibold">New link</h2>
          <form class="flex flex-wrap items-end gap-3" onsubmit={create}>
            <label class="flex flex-[2_1_200px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name (only you see it)
              <input bind:value={name} required maxlength="80" placeholder="Instagram bio" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
            </label>
            <label class="flex flex-[1_1_140px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Stops working
              <NativeSelect.Root bind:value={expires}>
                <NativeSelect.Option value="">Never</NativeSelect.Option><NativeSelect.Option value="7">In 7 days</NativeSelect.Option><NativeSelect.Option value="30">In 30 days</NativeSelect.Option><NativeSelect.Option value="90">In 90 days</NativeSelect.Option>
              </NativeSelect.Root>
            </label>
            <label class="flex flex-[1_1_120px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Max people
              <input bind:value={maxUses} inputmode="numeric" placeholder="No limit" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
            </label>
            {#if paymentsReady && packages.length}
              <label class="flex flex-[1_1_180px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">They pay for
                <NativeSelect.Root bind:value={packageId}>
                  <NativeSelect.Option value="">Nothing (free link)</NativeSelect.Option>
                  {#each packages as p (p.id)}<NativeSelect.Option value={p.id}>{p.name} · {priceText(p)}</NativeSelect.Option>{/each}
                </NativeSelect.Root>
              </label>
            {/if}
            <button type="submit" disabled={creating || !name.trim()} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Create link</button>
          </form>
          {#if formError}<p class="text-xs text-destructive">{formError}</p>{/if}
          {#if !paymentsReady}
            <p class="text-xs text-muted-foreground">Want people to pay through a link? <a href="/coaching/payments?tab=setup" class="text-primary hover:underline">Connect Stripe in Payments</a>.</p>
          {:else if !packages.length}
            <p class="text-xs text-muted-foreground">Make a package in <a href="/coaching/payments?tab=setup" class="text-primary hover:underline">Payments</a> to charge through a link.</p>
          {/if}
        </section>

        <section data-guide="links-table" class="rounded-[10px] border border-border bg-card px-1.5 py-2">
          <div class="overflow-x-auto">
            <Table.Root class="w-full min-w-[760px] border-collapse text-[13px]">
              <Table.Header><Table.Row class="text-left text-xs text-muted-foreground"><Table.Head class="px-3 py-2 font-medium">Name</Table.Head><Table.Head class="px-3 py-2 font-medium">Link</Table.Head><Table.Head class="px-3 py-2 font-medium">People</Table.Head><Table.Head class="px-3 py-2 font-medium">They pay for</Table.Head><Table.Head class="px-3 py-2 font-medium">Stops</Table.Head><Table.Head></Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each links as l (l.id)}
                  {@const live = l.state === "active" || l.state === "full"}
                  <Table.Row class="border-t border-border">
                    <Table.Cell class="px-3 py-3 font-medium {live ? '' : 'text-muted-foreground'}">{l.name}</Table.Cell>
                    <Table.Cell class="px-3 py-3">
                      <span class="whitespace-nowrap font-mono text-xs {live ? '' : 'text-muted-foreground'}">{location.host}/c/{l.code}</span>
                      {#if live}<button type="button" onclick={() => copy(l)} class="ml-1.5 h-[30px] whitespace-nowrap rounded-lg border border-border px-2.5 text-xs hover:bg-muted">Copy</button>{/if}
                    </Table.Cell>
                    <Table.Cell class="whitespace-nowrap px-3 py-3 {live ? '' : 'text-muted-foreground'}">{peopleText(l)}</Table.Cell>
                    <Table.Cell class="px-3 py-3">
                      {#if live && paymentsReady && packages.length}
                        <NativeSelect.Root size="sm" value={l.packageId ?? ""} onchange={(e) => changePackage(l, e.currentTarget.value)} aria-label="What people pay for through {l.name}"
                          class="max-w-[200px]">
                          <NativeSelect.Option value="">Free</NativeSelect.Option>
                          {#each packages as p (p.id)}<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>{/each}
                        </NativeSelect.Root>
                      {:else}
                        <span class="text-muted-foreground">{l.packageName ?? "Free"}</span>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="px-3 py-3">
                      {#if stateLabel[l.state]}<span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{stateLabel[l.state]}</span>{:else}<span class="text-muted-foreground">{l.expiresAt ? shortDate(Date.parse(l.expiresAt)) : "Never"}</span>{/if}
                    </Table.Cell>
                    <Table.Cell class="px-3 py-3 text-right">
                      {#if l.state !== "off"}<button type="button" onclick={() => (turningOff = l)} class="h-[30px] whitespace-nowrap rounded-lg border border-border px-2.5 text-xs hover:bg-muted">Turn off</button>{/if}
                    </Table.Cell>
                  </Table.Row>
                {:else}
                  <Table.Row><Table.Cell colspan={6} class="px-3 py-6 text-center text-muted-foreground">No links yet. Make one above.</Table.Cell></Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </section>
      </div>

      <section aria-label="What people see when they open a link" class="flex flex-[1_1_300px] flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground">What they see when they open a link</span>
        <div class="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-5" aria-hidden="true">
          <div class="flex items-center gap-3">
            <Avatar name={me?.displayName || me?.username || "You"} size={44} />
            <div><div class="text-base font-bold">{me?.displayName || me?.username} wants to coach you</div><div class="text-xs text-muted-foreground">@{me?.username} on LogIt</div></div>
          </div>
          <p class="text-[13px] leading-relaxed text-muted-foreground">They pick what you can see, then send you a request. They can change it any time in My coach.</p>
          <div class="flex flex-col">
            {#each SHARE_AREAS as a (a.key)}
              <div class="flex items-center justify-between border-t border-border py-2 text-[13px]"><span>{a.label}</span><span class="h-5 w-9 rounded-full bg-success/80"></span></div>
            {/each}
          </div>
          <div class="h-10 rounded-[9px] bg-primary text-center text-[13px] font-semibold leading-10 text-primary-foreground">Send request</div>
        </div>
      </section>
    </div>
  {/if}
</div>

<AlertDialog.Root open={turningOff !== null} onOpenChange={(o) => { if (!o) turningOff = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Turn off "{turningOff?.name}"?</AlertDialog.Title>
      <AlertDialog.Description>The link stops working for new people. Anyone who already joined stays your client, and requests already waiting stay for you to answer.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={turnOff}>Turn off</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
