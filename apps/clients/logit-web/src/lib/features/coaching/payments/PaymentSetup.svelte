<script lang="ts">
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { untrack } from "svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { coachPaymentsApi, type PackageInput } from "@logit/core/api/coachPaymentsApi";
  import {
    PAYMENT_COUNTRIES,
    priceText,
    type CoachPackage,
    type PaymentRule,
    type PaymentsOverview,
  } from "@logit/core/domain/coachPayments";

  let {
    data,
    reload,
    stripeUrls,
    onclients,
  }: {
    data: PaymentsOverview;
    reload: () => Promise<void>;
    stripeUrls: () => { returnUrl: string; refreshUrl: string };
    onclients: () => void;
  } = $props();

  const account = $derived(data.account);
  const currencySymbol = $derived(
    new Intl.NumberFormat("en-IE", { style: "currency", currency: account.currency.toUpperCase() })
      .formatToParts(0).find((p) => p.type === "currency")?.value ?? account.currency.toUpperCase(),
  );

  // ── Connect ──
  let country = $state("ie");
  let connecting = $state(false);
  async function connect() {
    connecting = true;
    try {
      const { url } = await coachPaymentsApi.connect({ country, ...stripeUrls() });
      location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe");
      connecting = false;
    }
  }

  // ── Packages ──
  let editing = $state<CoachPackage | "new" | null>(null);
  let form = $state({ name: "", description: "", price: "", interval: "month" as "month" | "once", weeks: "12", hidden: false });
  let saving = $state(false);
  let formError = $state<string | null>(null);

  function openNew() {
    editing = "new";
    form = { name: "", description: "", price: "", interval: "month", weeks: "12", hidden: false };
    formError = null;
  }
  function openEdit(p: CoachPackage) {
    editing = p;
    form = {
      name: p.name,
      description: p.description,
      price: String(p.amountCents / 100),
      interval: p.interval,
      weeks: String(p.weeks ?? 12),
      hidden: p.hidden,
    };
    formError = null;
  }

  async function savePackage(e: Event) {
    e.preventDefault();
    const price = Number(form.price.replace(",", "."));
    if (!Number.isFinite(price) || price < 1) {
      formError = "Enter a price of at least 1.";
      return;
    }
    const weeks = Number(form.weeks);
    if (form.interval === "once" && (!Number.isInteger(weeks) || weeks < 1)) {
      formError = "Enter how many weeks it lasts.";
      return;
    }
    const input: PackageInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      amountCents: Math.round(price * 100),
      interval: form.interval,
      weeks: form.interval === "once" ? weeks : null,
      hidden: form.hidden,
    };
    saving = true;
    formError = null;
    try {
      if (editing === "new") await coachPaymentsApi.createPackage(input);
      else if (editing) await coachPaymentsApi.updatePackage(editing.id, input);
      toast.success("Package saved");
      editing = null;
      await reload();
    } catch (err) {
      formError = err instanceof Error ? err.message : "Couldn't save the package";
    } finally {
      saving = false;
    }
  }

  // ── When a payment fails ──
  // A local copy, so typing doesn't jump when the overview reloads.
  let settings = $state(untrack(() => ({ ...data.settings })));
  let savingSettings = $state(false);
  async function saveSettings(e: Event) {
    e.preventDefault();
    savingSettings = true;
    try {
      settings = await coachPaymentsApi.saveSettings({ ...settings, failDays: Math.min(60, Math.max(1, Math.round(settings.failDays))) });
      toast.success("Saved");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      savingSettings = false;
    }
  }

  const rules: { value: PaymentRule; title: string; text: string }[] = [
    { value: "keep", title: "Keep coaching, just tell me", text: "Nothing changes for the client. You sort it out yourself." },
    { value: "pause", title: "Pause coaching after", text: "Their program, check-ins and messages with you stop until they pay. They keep their own app and data. Paying restarts it straight away." },
    { value: "end", title: "End coaching after", text: "As if they'd left: you stop seeing their data. They'd need a new invite link to come back." },
  ];
</script>

<div class="flex flex-wrap items-start gap-4">
  <div class="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
  {#if !account.connected && data.configured}
    <!-- First run: Stripe first; packages and settings only make sense after it. -->
    <section aria-labelledby="get-paid" class="rounded-[10px] border border-border bg-card px-6 pb-2 pt-5">
      <h2 id="get-paid" class="text-[19px] font-bold tracking-tight">Get paid by your clients</h2>
      <p class="mb-3.5 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Three steps. After that, people who open your invite link pay you and start straight away.</p>
      <ol>
        <li class="flex gap-3.5 border-t border-border py-[18px]">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">1</span>
          <div class="flex flex-1 flex-col gap-2.5">
            <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">Connect Stripe</span><span class="text-[13px] leading-relaxed text-muted-foreground">The money goes straight to your bank. Stripe asks for your ID and bank details, about 10 minutes. Stripe charges its normal card fees; LogIt charges nothing.</span></span>
            <div class="flex flex-wrap items-end gap-2.5">
              <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Where your business is
                <NativeSelect.Root bind:value={country} class="min-w-[200px]">
                  {#each PAYMENT_COUNTRIES as c (c.code)}<NativeSelect.Option value={c.code}>{c.name}</NativeSelect.Option>{/each}
                </NativeSelect.Root>
              </label>
              <button type="button" disabled={connecting} onclick={connect} class="h-[38px] rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{connecting ? "Opening Stripe…" : "Connect Stripe ↗"}</button>
            </div>
          </div>
        </li>
        <li class="flex gap-3.5 border-t border-border py-[18px] opacity-55">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold text-muted-foreground">2</span>
          <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">Make a package</span><span class="text-[13px] leading-relaxed text-muted-foreground">What clients pay for: monthly coaching, or a one-off block of weeks.</span></span>
        </li>
        <li class="flex gap-3.5 border-t border-border py-[18px] opacity-55">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold text-muted-foreground">3</span>
          <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">Put it on an invite link</span><span class="text-[13px] leading-relaxed text-muted-foreground">Share the link in your bio or a chat. People see your package, pay, and coaching starts.</span></span>
        </li>
      </ol>
      <div class="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pb-3 pt-3.5">
        <span class="text-[13px] text-muted-foreground">Clients already pay you another way?</span>
        <button type="button" onclick={onclients} class="h-9 rounded-[9px] border border-border px-3.5 text-[13px] font-medium hover:bg-muted">Mark them as paid elsewhere</button>
      </div>
    </section>
  {:else}
    {#if account.connected}
      <section class="flex flex-wrap items-center gap-3 rounded-[10px] border bg-card px-[18px] py-4 {account.ready ? 'border-border' : 'border-warning/30'}">
        <span class="flex flex-[1_1_300px] flex-col gap-1">
          <span class="flex items-center gap-2">
            <h2 class="text-sm font-semibold">Stripe account</h2>
            {#if account.ready}
              <span class="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Connected</span>
            {:else}
              <span class="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">Setup not finished</span>
            {/if}
          </span>
          <span class="text-[13px] text-muted-foreground">
            {account.displayName ?? "Your account"} · prices in {account.currency.toUpperCase()}
            {#if account.requirementsDue} · Stripe needs more details from you{/if}
          </span>
        </span>
        {#if !account.ready || account.requirementsDue}
          <button type="button" disabled={connecting} onclick={connect} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{account.ready ? "Update details on Stripe" : "Finish setup on Stripe"}</button>
        {/if}
      </section>
    {/if}

    <section class="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-1.5 pb-2 pt-3.5">
      <div class="flex items-center justify-between px-3">
        <h2 class="text-sm font-semibold">Packages</h2>
        <button type="button" onclick={openNew} class="h-[30px] rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground">New package</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] border-collapse text-[13px]">
          <thead><tr class="text-left text-xs text-muted-foreground"><th class="px-3 py-2 font-medium">Package</th><th class="px-3 py-2 font-medium">Price</th><th class="px-3 py-2 font-medium">On invite links</th><th class="px-3 py-2 font-medium">Clients</th><th></th></tr></thead>
          <tbody>
            {#each data.packages as p (p.id)}
              <tr class="border-t border-border">
                <td class="px-3 py-3">
                  <span class="block font-medium {p.hidden ? 'text-muted-foreground' : ''}">{p.name}</span>
                  {#if p.description}<span class="line-clamp-1 text-xs text-muted-foreground">{p.description.split(/\n+/).join(" · ")}</span>{/if}
                </td>
                <td class="px-3 py-3 {p.hidden ? 'text-muted-foreground' : ''}">{priceText(p)}</td>
                <td class="px-3 py-3 {p.links.length ? '' : 'text-muted-foreground'}">{p.links.length ? p.links.join(", ") : "None"}</td>
                <td class="px-3 py-3">{p.clients}</td>
                <td class="px-3 py-3 text-right">
                  {#if p.hidden}<span class="mr-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Hidden</span>{/if}
                  <button type="button" onclick={() => openEdit(p)} class="h-[30px] rounded-lg border border-border px-2.5 text-xs hover:bg-muted">Edit</button>
                </td>
              </tr>
            {:else}
              <tr><td colspan="5" class="px-3 py-6 text-center text-muted-foreground">No packages yet. Make one, then put it on an invite link.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    {#if editing}
      <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">{editing === "new" ? "New package" : `Edit ${editing.name}`}</h2>
        <form class="flex flex-col gap-3" onsubmit={savePackage}>
          <div class="flex flex-wrap gap-3">
            <label class="flex flex-[2_1_220px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name (clients see it)
              <input bind:value={form.name} required maxlength="80" placeholder="Online coaching" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
            </label>
            <label class="flex flex-[1_1_120px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Price ({currencySymbol})
              <input bind:value={form.price} required inputmode="decimal" placeholder="120" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
            </label>
            <label class="flex flex-[1_1_200px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">How they pay
              <NativeSelect.Root bind:value={form.interval}>
                <NativeSelect.Option value="month">Every month until cancelled</NativeSelect.Option>
                <NativeSelect.Option value="once">Once, for a set number of weeks</NativeSelect.Option>
              </NativeSelect.Root>
            </label>
            {#if form.interval === "once"}
              <label class="flex flex-[0_1_100px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Weeks
                <input bind:value={form.weeks} inputmode="numeric" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
              </label>
            {/if}
          </div>
          <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">What's included (shown on the payment page)
            <textarea bind:value={form.description} maxlength="600" rows="3" placeholder="Custom program, weekly check-in with written feedback, messages within 24 h." class="rounded-[9px] border border-input bg-background px-2.5 py-2 text-[13px] text-foreground"></textarea>
          </label>
          {#if editing !== "new"}
            <label class="flex items-center gap-2.5 text-[13px]"><Checkbox bind:checked={form.hidden} /> Hidden: comes off its links; clients already on it keep paying</label>
            <p class="text-xs text-muted-foreground">A new price applies to people who pay from now on. Clients already paying keep their price.</p>
          {/if}
          {#if formError}<p class="text-xs text-destructive">{formError}</p>{/if}
          <div class="flex justify-end gap-2">
            <button type="button" onclick={() => (editing = null)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
            <button type="submit" disabled={saving || !form.name.trim()} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Save package</button>
          </div>
        </form>
      </section>
    {/if}

    <form class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4" onsubmit={saveSettings}>
      <div>
        <h2 class="text-sm font-semibold">When a payment fails</h2>
        <p class="mt-1 text-[13px] leading-relaxed text-muted-foreground">LogIt emails your client a link to update their card, and Stripe tries it again over a few days. Choose what happens to coaching meanwhile. The same applies when a one-off package runs out or a monthly plan is stopped. This is your default; you can change it for one client on the Clients tab.</p>
      </div>
      <RadioGroup.Root bind:value={settings.failRule} aria-label="If a payment fails" class="flex flex-col gap-2">
        {#each rules as r (r.value)}
          <label class="flex items-start gap-3 rounded-[9px] border p-3 text-[13px] {settings.failRule === r.value ? 'border-primary bg-muted' : 'border-border'}">
            <RadioGroup.Item value={r.value} />
            <span class="flex flex-col gap-1">
              <span class="flex flex-wrap items-center gap-1.5 font-medium">
                {r.title}
                {#if r.value !== "keep"}
                  <input type="number" min="1" max="60" bind:value={settings.failDays} disabled={settings.failRule !== r.value} aria-label="Days unpaid"
                    class="h-[30px] w-14 rounded-[7px] border border-input bg-background px-2 text-center disabled:opacity-50" /> days unpaid
                {/if}
              </span>
              <span class="text-xs leading-relaxed text-muted-foreground">{r.text}</span>
            </span>
          </label>
        {/each}
      </RadioGroup.Root>
      <label class="flex items-center gap-2.5 text-[13px]"><Checkbox bind:checked={settings.emailOnFail} /> Email me about payments (new clients and failed cards)</label>
      <label class="flex items-center gap-2.5 text-[13px]"><Checkbox bind:checked={settings.showClientNote} /> Show the client a note in the app (no price, no pay button)</label>
      <div class="flex justify-end"><button type="submit" disabled={savingSettings} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Save</button></div>
    </form>
  {/if}
  </div>

  <aside class="flex flex-[1_1_300px] flex-col gap-4">

    <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] pb-1.5 pt-3.5">
      <h2 class="pb-1.5 text-sm font-semibold">Good to know</h2>
      <div class="flex flex-col gap-0.5 border-t border-border py-2.5 text-[13px]"><span class="font-medium">Put a package on an invite link</span><span class="text-xs leading-relaxed text-muted-foreground">In Invite links. People pay on the link's page, then get the app. Paid links start coaching straight away, with no Accept step.</span></div>
      <div class="flex flex-col gap-0.5 border-t border-border py-2.5 text-[13px]"><span class="font-medium">Refunds and receipts</span><span class="text-xs leading-relaxed text-muted-foreground">Refunds are done in your Stripe dashboard. Clients find their receipts under Manage payment in My coach on the web.</span></div>
      <div class="flex flex-col gap-0.5 border-t border-border py-2.5 text-[13px]"><span class="font-medium">Discount codes</span><span class="text-xs leading-relaxed text-muted-foreground">Make them under Coupons in your Stripe dashboard. Clients type them on Stripe's payment page.</span></div>
      <div class="flex flex-col gap-0.5 border-t border-border py-2.5 text-[13px]"><span class="font-medium">Stopping</span><span class="text-xs leading-relaxed text-muted-foreground">Clients stop their plan in My coach, or you stop it from Manage. Coaching runs to the end of the month they paid for. If either of you ends coaching, the plan is cancelled at once.</span></div>
      <div class="flex flex-col gap-0.5 border-t border-border py-2.5 text-[13px]"><span class="font-medium">Tax</span><span class="text-xs leading-relaxed text-muted-foreground">You're the seller, so VAT or income tax on these payments is yours to handle.</span></div>
    </section>
  </aside>
</div>
