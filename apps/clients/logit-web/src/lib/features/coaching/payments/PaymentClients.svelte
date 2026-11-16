<script lang="ts">
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import {
    coachClientChip,
    coachProblemText,
    formatMoney,
    needsCoach,
    ruleText,
    shortDate,
    type PaymentClient,
    type PaymentRule,
    type PaymentsOverview,
    type Tone,
  } from "@logit/core/domain/coachPayments";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";

  let { data, reload, onsetup }: { data: PaymentsOverview; reload: () => Promise<void>; onsetup: () => void } = $props();

  const now = new Date();
  const problems = $derived(needsCoach(data.clients, now));
  const nameOf = (c: PaymentClient) => c.client.displayName || c.client.username;

  const toneClass: Record<Tone, string> = {
    ok: "bg-success/12 text-success",
    warn: "bg-warning/12 text-warning",
    bad: "bg-destructive/12 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };

  function packageText(c: PaymentClient): string {
    if (c.mode === "elsewhere") return "Paid elsewhere";
    if (c.mode === "none") return "Not paying through LogIt";
    const money = c.amountCents != null && c.currency ? formatMoney(c.amountCents, c.currency) : "";
    return `${c.packageName} · ${money}${c.interval === "month" ? " a month" : " once"}`;
  }

  function nextText(c: PaymentClient): string {
    if (c.mode === "none") return "";
    if (c.mode === "elsewhere") return c.paidUntil ? `Reminder on ${shortDate(c.paidUntil, now)}` : "No end date";
    if (c.state === "failed") return `Was due ${shortDate(c.unpaidSince, now)}`;
    if (c.state === "ended") return `Ended ${shortDate(c.unpaidSince, now)}`;
    if (c.interval === "once") return `None · ends ${shortDate(c.paidUntil, now)}`;
    return c.stopsAtPeriodEnd ? `None · stops ${shortDate(c.paidUntil, now)}` : shortDate(c.paidUntil, now);
  }

  function ruleCell(c: PaymentClient): string {
    if (c.mode !== "stripe") return "Doesn't apply";
    return c.ownRule ? ruleText(c.rule, c.days) : "Your default";
  }

  // ── Actions ──
  let busy = $state(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    busy = true;
    try {
      await fn();
      toast.success(done);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = false;
    }
  }

  // Rule for one client
  let ruleFor = $state<PaymentClient | null>(null);
  let ruleChoice = $state<"default" | PaymentRule>("default");
  let ruleDays = $state(7);
  function openRule(c: PaymentClient) {
    ruleFor = c;
    ruleChoice = c.ownRule ?? "default";
    ruleDays = c.ownDays ?? data.settings.failDays;
  }
  function saveRule() {
    const c = ruleFor!;
    ruleFor = null;
    const rule = ruleChoice === "default" ? null : ruleChoice;
    void run(() => coachPaymentsApi.setClientRule(c.relationshipId, rule, rule ? ruleDays : null), `Saved for ${nameOf(c)}`);
  }

  // Paid elsewhere
  let elsewhereFor = $state<PaymentClient | null>(null);
  let elsewhereUntil = $state("");
  function openElsewhere(c: PaymentClient) {
    elsewhereFor = c;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    elsewhereUntil = d.toISOString().slice(0, 10);
  }
  function saveElsewhere() {
    const c = elsewhereFor!;
    elsewhereFor = null;
    void run(() => coachPaymentsApi.markPaidElsewhere(c.relationshipId, elsewhereUntil || null), `${nameOf(c)} marked as paid`);
  }

  // Stop a plan / end coaching
  let stopFor = $state<PaymentClient | null>(null);
  let endFor = $state<PaymentClient | null>(null);
  function stopPlan(c: PaymentClient, stop: boolean) {
    stopFor = null;
    void run(() => coachPaymentsApi.stopClientPlan(c.relationshipId, stop), stop ? "Their plan stops at the end of the month" : "Their plan carries on");
  }
  function endCoaching() {
    const c = endFor!;
    endFor = null;
    void run(async () => {
      await coachApi.revokeRelationship(c.relationshipId);
      void coachBadges.refresh(true, true);
    }, `You no longer coach ${nameOf(c)}`);
  }
</script>

<div class="flex flex-wrap gap-3">
  <div class="flex flex-[1_1_180px] flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4">
    <span class="text-xs text-muted-foreground">Paid to you this month</span>
    <span class="text-2xl font-bold tracking-tight">{formatMoney(data.summary.monthCents, data.summary.currency)}</span>
    <span class="text-xs text-muted-foreground">{data.summary.monthCount} payment{data.summary.monthCount === 1 ? "" : "s"}, before Stripe's fees</span>
  </div>
  <div class="flex flex-[1_1_180px] flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4">
    <span class="text-xs text-muted-foreground">Paying through LogIt</span>
    <span class="text-2xl font-bold tracking-tight">{data.summary.paying}</span>
  </div>
  <div class="flex flex-[1_1_180px] flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4">
    <span class="text-xs text-muted-foreground">Paid elsewhere</span>
    <span class="text-2xl font-bold tracking-tight">{data.summary.elsewhere}</span>
    <span class="text-xs text-muted-foreground">You mark these yourself</span>
  </div>
  <div class="flex flex-[1_1_180px] flex-col gap-1 rounded-[10px] border bg-card px-[18px] py-4 {data.summary.problems ? 'border-destructive/30' : 'border-border'}">
    <span class="text-xs text-muted-foreground">Payment problems</span>
    <span class="text-2xl font-bold tracking-tight {data.summary.problems ? 'text-destructive' : ''}">{data.summary.problems}</span>
    {#if problems.length}<span class="text-xs text-muted-foreground">{problems.slice(0, 3).map(nameOf).join(", ")}</span>{/if}
  </div>
</div>

{#if !data.account.ready && data.configured}
  <section class="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
    <span class="flex-[1_1_300px] text-[13px] text-muted-foreground">
      {data.account.connected ? "Finish setting up Stripe to take payments through your invite links." : "Connect Stripe and clients can pay you when they use your invite link."}
    </span>
    <button type="button" onclick={onsetup} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">{data.account.connected ? "Finish setup" : "Connect Stripe"}</button>
  </section>
{/if}

{#if problems.length}
  <section class="flex flex-col gap-2.5 rounded-[10px] border border-destructive/30 bg-card px-[18px] py-4">
    <h2 class="text-sm font-semibold">Needs you</h2>
    {#each problems as c (c.relationshipId)}
      <div class="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-3">
        <Avatar name={nameOf(c)} url={c.client.avatarUrl} />
        <span class="min-w-0 flex-[1_1_360px] text-[13px] leading-relaxed">{coachProblemText(c, now)}</span>
        <span class="flex flex-wrap gap-2">
          {#if c.status === "active"}
            <a href="/messages?c={c.relationshipId}" class="inline-flex h-[30px] items-center rounded-lg border border-border px-2.5 text-xs hover:bg-background">Message {nameOf(c)}</a>
          {/if}
          {#if c.mode === "stripe" && c.rule !== "keep"}
            <button type="button" disabled={busy} onclick={() => run(() => coachPaymentsApi.setClientRule(c.relationshipId, "keep", null), `${nameOf(c)} keeps being coached`)}
              class="h-[30px] rounded-lg border border-border px-2.5 text-xs hover:bg-background disabled:opacity-50">{c.status === "paused" ? `Restart ${nameOf(c)} anyway` : `Don't ${c.rule === "end" ? "end" : "pause"} ${nameOf(c)}`}</button>
          {/if}
          {#if c.mode === "elsewhere"}
            <button type="button" disabled={busy} onclick={() => openElsewhere(c)} class="h-[30px] rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Mark paid</button>
          {/if}
        </span>
      </div>
    {/each}
  </section>
{/if}

<section class="rounded-[10px] border border-border bg-card px-1.5 py-2">
  <div class="overflow-x-auto">
    <table class="w-full min-w-[860px] border-collapse text-[13px]">
      <thead><tr class="text-left text-xs text-muted-foreground"><th class="px-3 py-2 font-medium">Client</th><th class="px-3 py-2 font-medium">Package</th><th class="px-3 py-2 font-medium">Status</th><th class="px-3 py-2 font-medium">Next payment</th><th class="px-3 py-2 font-medium">If a payment fails</th><th></th></tr></thead>
      <tbody>
        {#each data.clients as c (c.relationshipId)}
          {@const chip = coachClientChip(c, now)}
          <tr class="border-t border-border">
            <td class="px-3 py-3">
              <a href="/clients/{c.client.id}" class="flex items-center gap-2.5">
                <Avatar name={nameOf(c)} url={c.client.avatarUrl} size={30} />
                <span><span class="block font-medium">{nameOf(c)}</span><span class="text-xs text-muted-foreground">@{c.client.username}</span></span>
              </a>
            </td>
            <td class="px-3 py-3 {c.mode === 'stripe' ? '' : 'text-muted-foreground'}">{packageText(c)}</td>
            <td class="px-3 py-3"><span class="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold {toneClass[chip.tone]}">{chip.label}</span></td>
            <td class="px-3 py-3 {c.state === 'paid' && c.interval === 'month' && !c.stopsAtPeriodEnd ? '' : 'text-muted-foreground'}">{nextText(c)}</td>
            <td class="px-3 py-3 {c.ownRule ? '' : 'text-muted-foreground'}">{ruleCell(c)}</td>
            <td class="px-3 py-3 text-right">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <button {...props} type="button" aria-label="Manage {nameOf(c)}" class="inline-flex h-[30px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-muted">Manage <MoreHorizontalIcon class="size-3.5" /></button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  {#if c.mode === "stripe"}
                    <DropdownMenu.Item onclick={() => openRule(c)}>If a payment fails: {c.ownRule ? ruleText(c.rule, c.days) : `your default (${ruleText(c.rule, c.days).toLowerCase()})`}…</DropdownMenu.Item>
                  {/if}
                  <DropdownMenu.Item onclick={() => openElsewhere(c)}>{c.mode === "elsewhere" ? "Mark paid again…" : "Switch to paid elsewhere…"}</DropdownMenu.Item>
                  {#if c.mode === "stripe" && c.interval === "month" && c.state !== "ended"}
                    {#if c.stopsAtPeriodEnd}
                      <DropdownMenu.Item onclick={() => stopPlan(c, false)}>Keep their plan going</DropdownMenu.Item>
                    {:else}
                      <DropdownMenu.Item onclick={() => (stopFor = c)}>Stop their plan at the end of the month…</DropdownMenu.Item>
                    {/if}
                  {/if}
                  {#if c.mode === "stripe"}
                    <DropdownMenu.Item onclick={() => window.open("https://dashboard.stripe.com/payments", "_blank", "noopener")}>See payments in Stripe ↗</DropdownMenu.Item>
                  {/if}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item class="text-destructive" onclick={() => (endFor = c)}>Stop coaching {nameOf(c)}…</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </td>
          </tr>
        {:else}
          <tr><td colspan="6" class="px-3 py-6 text-center text-muted-foreground">No clients yet. When someone pays through one of your invite links they show up here.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<Dialog.Root open={ruleFor !== null} onOpenChange={(o) => { if (!o) ruleFor = null; }}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>If {ruleFor ? nameOf(ruleFor) : ""}'s payment fails</Dialog.Title>
      <Dialog.Description>Stripe retries the card and emails them a link to update it. Choose what happens to their coaching meanwhile.</Dialog.Description>
    </Dialog.Header>
    <fieldset class="flex flex-col gap-2">
      <legend class="sr-only">Rule</legend>
      {#each [["default", `Your default (${ruleText(data.settings.failRule, data.settings.failDays).toLowerCase()})`], ["keep", "Keep coaching, just tell me"], ["pause", "Pause coaching after"], ["end", "End coaching after"]] as [value, label] (value)}
        <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] {ruleChoice === value ? 'border-primary bg-muted' : 'border-border'}">
          <input type="radio" name="client-rule" {value} bind:group={ruleChoice} class="accent-primary" />
          <span>{label}</span>
          {#if (value === "pause" || value === "end") && ruleChoice === value}
            <input type="number" min="1" max="60" bind:value={ruleDays} aria-label="Days" class="h-8 w-16 rounded-md border border-input bg-background px-2 text-center" /> <span>days</span>
          {/if}
        </label>
      {/each}
    </fieldset>
    <Dialog.Footer>
      <button type="button" onclick={() => (ruleFor = null)} class="h-9 rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
      <button type="button" onclick={saveRule} class="h-9 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Save</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={elsewhereFor !== null} onOpenChange={(o) => { if (!o) elsewhereFor = null; }}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{elsewhereFor ? nameOf(elsewhereFor) : ""} paid you elsewhere</Dialog.Title>
      <Dialog.Description>
        For clients who pay by bank transfer, cash or your own link. Nothing is charged through LogIt, and you get a reminder when the date passes.
        {#if elsewhereFor?.mode === "stripe" && elsewhereFor.state !== "ended"} Their plan through LogIt stops now so they aren't charged twice.{/if}
      </Dialog.Description>
    </Dialog.Header>
    <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Paid up to
      <input type="date" bind:value={elsewhereUntil} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
    </label>
    <Dialog.Footer>
      <button type="button" onclick={() => (elsewhereFor = null)} class="h-9 rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
      <button type="button" onclick={saveElsewhere} class="h-9 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Mark paid</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={stopFor !== null} onOpenChange={(o) => { if (!o) stopFor = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop {stopFor ? nameOf(stopFor) : ""}'s plan?</AlertDialog.Title>
      <AlertDialog.Description>They aren't charged again. Coaching carries on until {shortDate(stopFor?.paidUntil, now)}, the end of the month they paid for; after that your rule for unpaid clients applies.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => stopFor && stopPlan(stopFor, true)}>Stop the plan</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={endFor !== null} onOpenChange={(o) => { if (!o) endFor = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop coaching {endFor ? nameOf(endFor) : ""}?</AlertDialog.Title>
      <AlertDialog.Description>You stop seeing their data and they lose your program, check-ins and messages. {endFor?.mode === "stripe" && endFor.state !== "ended" ? "Their plan is cancelled now; refunds, if any, are done in Stripe." : ""}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={endCoaching}>Stop coaching</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
