<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import CheckIcon from "@lucide/svelte/icons/check";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { reveal } from "$lib/transitions";
  import { apiClient } from "@logit/core/api/client";
  import { ago, daysBetween, shortDate } from "$lib/features/coaching/format";
  import { adminApi, at, describeAction, type Overview } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";
  import DaysGrid from "$lib/features/admin/DaysGrid.svelte";

  let data = $state<Overview | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let emailHelp = $state(false);

  const host = (() => { try { return new URL(apiClient.getBaseUrl()).host; } catch { return "this server"; } })();

  // "Let it end" on an invite hides it from Needs you on this browser.
  const hiddenKey = `logit:admin:hidden-invites:${apiClient.getUser()?.id ?? ""}`;
  let hiddenInvites = $state<string[]>([]);

  async function load() {
    try {
      data = await adminApi.overview();
      adminState.setCounts(data);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load the overview";
    }
  }
  onMount(() => {
    try { hiddenInvites = JSON.parse(localStorage.getItem(hiddenKey) ?? "[]"); } catch { hiddenInvites = []; }
    void load();
  });

  type Need = { id: string; tone: "bad" | "warn" | "quiet"; title: string; text: string };
  const needs = $derived.by<Need[]>(() => {
    if (!data) return [];
    const list: Need[] = [];
    if (data.newestReport) {
      const r = data.newestReport;
      const more = data.openReports > 1 ? ` · ${data.openReports - 1} more open` : "";
      list.push({ id: `report:${r.id}`, tone: "bad", title: `A ${r.targetType.toLowerCase()} was reported as ${r.reason.toLowerCase()}`, text: `By @${r.reporter}, ${ago(at(r.createdAt))}${more}` });
    }
    if (data.pluginsWaiting > 0)
      list.push({ id: "plugins", tone: "warn", title: `${data.pluginsWaiting} plugin version${data.pluginsWaiting === 1 ? "" : "s"} waiting for review`, text: "Nobody else can install a version until it's approved." });
    if (!data.server.emailConfigured && data.people > 1)
      list.push({ id: "email", tone: "warn", title: "Email isn't set up", text: "Password reset emails can't be sent. Until it is, reset passwords from a person's page." });
    for (const i of data.invitesEndingSoon) {
      if (hiddenInvites.includes(i.id)) continue;
      list.push({ id: `invite:${i.id}`, tone: "quiet", title: `"${i.note ?? i.code}" invite ends ${endsText(at(i.expiresAt))}`, text: `Used ${i.useCount} of ${i.maxUses} times.` });
    }
    return list;
  });

  function endsText(ms: number): string {
    const d = daysBetween(Date.now(), ms);
    return d <= 0 ? "today" : d === 1 ? "tomorrow" : `on ${shortDate(ms)}`;
  }

  // A server with only its admin gets a setup list instead of an empty Needs you.
  const settingUp = $derived(data !== null && data.people <= 1);

  async function dismissReport(id: string) {
    busy = id;
    try {
      await adminApi.resolveReport(id, "dismiss");
      toast.success("Report dismissed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't dismiss the report");
    } finally {
      busy = null;
    }
  }

  async function extend(id: string) {
    busy = id;
    try {
      await adminApi.extendInvite(id, 7);
      toast.success("Invite extended by 7 days");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't extend the invite");
    } finally {
      busy = null;
    }
  }

  function letEnd(id: string) {
    hiddenInvites = [...hiddenInvites, id];
    try { localStorage.setItem(hiddenKey, JSON.stringify(hiddenInvites)); } catch { /* hidden for this visit */ }
  }

  const dot = { bad: "bg-destructive", warn: "bg-warning", quiet: "bg-muted-foreground" } as const;
  const btn = "inline-flex h-[34px] items-center whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium disabled:opacity-50";
  const btnSecondary = `${btn} bg-muted hover:bg-accent`;
  const btnPrimary = `${btn} bg-primary text-primary-foreground font-semibold`;
</script>

{#snippet emailSteps()}
  <ol class="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-muted-foreground" transition:reveal>
    <li>In the <code class="rounded bg-muted px-1 text-xs">.env</code> file next to docker-compose.yml, fill in <code class="rounded bg-muted px-1 text-xs">SMTP_HOST</code>, <code class="rounded bg-muted px-1 text-xs">SMTP_PORT</code>, <code class="rounded bg-muted px-1 text-xs">SMTP_USER</code>, <code class="rounded bg-muted px-1 text-xs">SMTP_PASSWORD</code> and <code class="rounded bg-muted px-1 text-xs">SMTP_FROM_ADDRESS</code> from your email provider.</li>
    <li>Run <code class="rounded bg-muted px-1 text-xs">docker compose up -d</code> to restart with them.</li>
  </ol>
{/snippet}

<div class="flex flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Overview</h1>
      {#if data}<p class="mt-0.5 text-[13px] text-muted-foreground">{host} · {data.server.registrationMode === "invite" ? "invite-only sign-ups" : "anyone can sign up"}</p>{/if}
    </div>
    <a href="/admin/invites" class={btnPrimary}>Create invite</a>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !data}
    <Skeleton class="h-36" /><Skeleton class="h-48" />
  {:else}
    {#if settingUp}
      <section aria-labelledby="setup" class="flex flex-col gap-2">
        <h2 id="setup" class="text-[15px] font-semibold">Finish setting up <span class="font-normal text-muted-foreground">{data.server.emailConfigured ? 2 : 1} of 3 done</span></h2>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-[18px] py-3.5">
          <span class="grid size-7 place-items-center rounded-full bg-success/20 text-success" role="img" aria-label="Done"><CheckIcon class="size-4" /></span>
          <div class="min-w-0 flex-[1_1_280px]"><div class="text-sm font-semibold">Make an admin</div><div class="text-[13px] text-muted-foreground">You're the admin. You can add more from a person's page.</div></div>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-[18px] py-3.5">
          <span class="grid size-7 place-items-center rounded-full bg-muted text-[13px] font-semibold">2</span>
          <div class="min-w-0 flex-[1_1_280px]"><div class="text-sm font-semibold">Invite the first people</div><div class="text-[13px] text-muted-foreground">{data.server.registrationMode === "invite" ? "Sign-ups are invite-only. One invite can be used by a whole group, like a gym's members." : "Anyone who knows this server's address can sign up. An invite gives them a ready-to-send message."}</div></div>
          <a href="/admin/invites" class={btnPrimary}>Create invite</a>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-[18px] py-3.5">
          {#if data.server.emailConfigured}
            <span class="grid size-7 place-items-center rounded-full bg-success/20 text-success" role="img" aria-label="Done"><CheckIcon class="size-4" /></span>
          {:else}
            <span class="grid size-7 place-items-center rounded-full bg-muted text-[13px] font-semibold">3</span>
          {/if}
          <div class="min-w-0 flex-[1_1_280px]">
            <div class="text-sm font-semibold">Set up email</div>
            <div class="text-[13px] text-muted-foreground">{data.server.emailConfigured ? "Done. People can reset a forgotten password themselves." : "So people can reset a forgotten password themselves. Optional: you can reset passwords here instead."}</div>
            {#if emailHelp}{@render emailSteps()}{/if}
          </div>
          {#if !data.server.emailConfigured}<button type="button" class={btnSecondary} aria-expanded={emailHelp} onclick={() => (emailHelp = !emailHelp)}>{emailHelp ? "Hide the steps" : "How to set it up"}</button>{/if}
        </div>
      </section>
    {:else}
      <section aria-labelledby="needs" class="flex flex-col gap-2">
        <h2 id="needs" class="text-[15px] font-semibold">Needs you {#if needs.length}<span class="font-normal text-muted-foreground">{needs.length}</span>{/if}</h2>
        {#each needs as n (n.id)}
          <div animate:flip={{ duration: 160 }} transition:reveal class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-[18px] py-3.5">
            <span class="size-2.5 shrink-0 rounded-full {dot[n.tone]}" aria-hidden="true"></span>
            <div class="min-w-0 flex-[1_1_300px]">
              <div class="text-sm font-semibold">{n.title}</div>
              <div class="text-[13px] text-muted-foreground">{n.text}</div>
              {#if n.id === "email" && emailHelp}{@render emailSteps()}{/if}
            </div>
            {#if n.id.startsWith("report:")}
              {@const id = n.id.slice(7)}
              <button type="button" class={btnSecondary} disabled={busy === id} onclick={() => dismissReport(id)}>Dismiss</button>
              <a href="/admin/reports?id={id}" class={btnPrimary}>Review</a>
            {:else if n.id === "plugins"}
              <a href="/admin/plugins" class={btnPrimary}>Review</a>
            {:else if n.id === "email"}
              <button type="button" class={btnSecondary} aria-expanded={emailHelp} onclick={() => (emailHelp = !emailHelp)}>{emailHelp ? "Hide the steps" : "How to set it up"}</button>
            {:else if n.id.startsWith("invite:")}
              {@const id = n.id.slice(7)}
              <button type="button" class={btnSecondary} onclick={() => letEnd(id)}>Let it end</button>
              <button type="button" class={btnPrimary} disabled={busy === id} onclick={() => extend(id)}>Extend 7 days</button>
            {/if}
          </div>
        {:else}
          <p class="rounded-xl border border-dashed border-border px-[18px] py-3.5 text-[13px] text-muted-foreground">Nothing needs you right now. Reports, plugins waiting for review and invites about to end show up here.</p>
        {/each}
      </section>
    {/if}

    <div class="flex flex-wrap items-start gap-4">
      <section aria-labelledby="days" class="min-w-0 flex-[3_1_560px] rounded-[14px] border border-border bg-card px-5 py-[18px]">
        <h2 id="days" class="mb-3 text-[15px] font-semibold">Last 14 days</h2>
        {#if settingUp && data.days.every((d) => d.signUps === 0 && d.workouts === 0)}
          <p class="text-[13px] text-muted-foreground">Each day's sign-ups and workouts appear here once people join and train.</p>
        {:else}
          <DaysGrid days={data.days} emailConfigured={data.server.emailConfigured} />
          <p class="mt-2 text-xs text-muted-foreground">Darker means more. Today is outlined. Days are in UTC.</p>
        {/if}
      </section>
      <section aria-label="Numbers" class="flex flex-[1_1_220px] flex-col gap-2.5">
        {#each [["People", `${data.people}`], ["Trained this week", `${data.trainedThisWeek} of ${data.people}`], ["Workouts, 30 days", `${data.workouts30Days}`]] as [label, value] (label)}
          <div class="flex items-baseline justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span class="text-[13px] text-muted-foreground">{label}</span><strong class="text-xl font-semibold tabular-nums">{value}</strong>
          </div>
        {/each}
      </section>
    </div>

    {#if data.recentActions.length}
      <section aria-labelledby="recent" class="rounded-[14px] border border-border bg-card px-5 py-[18px]">
        <h2 id="recent" class="mb-2 text-[15px] font-semibold">Recently done by admins</h2>
        <ul class="flex flex-col text-sm">
          {#each data.recentActions as a (a.id)}
            <li class="flex flex-wrap justify-between gap-x-4 border-t border-border py-2"><span>{describeAction(a)}</span><span class="text-muted-foreground">{ago(at(a.createdAt))}</span></li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>
