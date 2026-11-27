<!-- Payments › Settings (canvas K10, K18): the Stripe account, what happens when a card fails,
     emails, and stopping payments through LogIt (a way out for a coach leaving Stripe). -->
<script lang="ts">
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { untrack } from "svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { PAYMENT_COUNTRIES, type PaymentRule, type PaymentsOverview } from "@logit/core/domain/coachPayments";

  let { data, reload, stripeUrls }: { data: PaymentsOverview; reload: () => Promise<void>; stripeUrls: () => { returnUrl: string; refreshUrl: string } } = $props();

  const account = $derived(data.account);
  const paying = $derived(data.clients.filter((c) => c.mode === "stripe" && c.state !== "ended").length);

  // A local copy, so typing doesn't jump when the overview reloads.
  let settings = $state(untrack(() => ({ ...data.settings })));
  let saving = $state(false);
  async function save(e: Event) {
    e.preventDefault();
    saving = true;
    try {
      settings = await coachPaymentsApi.saveSettings({ ...settings, failDays: Math.min(60, Math.max(1, Math.round(settings.failDays))) });
      toast.success("Saved");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      saving = false;
    }
  }

  let opening = $state(false);
  async function update() {
    opening = true;
    try {
      location.href = (await coachPaymentsApi.connect({ country: account.country, ...stripeUrls() })).url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe");
      opening = false;
    }
  }

  let stopOpen = $state(false);
  let stopping = $state(false);
  async function stop() {
    stopping = true;
    try {
      const r = await coachPaymentsApi.stopTakingPayments();
      toast.success(r.plansStopped ? `Stopped. ${r.plansStopped} ${r.plansStopped === 1 ? "plan stops" : "plans stop"} renewing.` : "Stopped taking payments through LogIt");
      stopOpen = false;
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop");
    } finally {
      stopping = false;
    }
  }

  const rules: { value: PaymentRule; title: string; text: string }[] = [
    { value: "keep", title: "Keep coaching", text: "You sort it out yourself." },
    { value: "pause", title: "Pause coaching until they pay", text: "Program, check-ins and messages stop; paying restarts them." },
    { value: "end", title: "End coaching", text: "As if they'd left." },
  ];
</script>

<div class="flex flex-col rounded-[12px] border border-border bg-card">
  {#if account.connected}
    <section class="flex flex-wrap gap-x-7 gap-y-2.5 px-5 py-4">
      <h2 class="flex-[1_1_180px] text-sm font-semibold sm:max-w-[220px]">Stripe account</h2>
      <div class="flex min-w-0 flex-[999_1_360px] flex-col gap-3 text-[13px]">
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          <dt class="text-muted-foreground">Name</dt><dd>{account.displayName ?? "Your account"}</dd>
          <dt class="text-muted-foreground">Prices in</dt><dd>{account.currency.toUpperCase()} · {PAYMENT_COUNTRIES.find((c) => c.code === account.country)?.name ?? account.country.toUpperCase()}</dd>
          <dt class="text-muted-foreground">Status</dt><dd>{account.ready ? "Taking payments" : account.needs ? `Stripe needs: ${account.needs}` : "Not finished"}</dd>
        </dl>
        <span class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" href="https://dashboard.stripe.com/" target="_blank" rel="noopener">Open Stripe dashboard ↗</Button>
          <Button size="sm" variant="outline" disabled={opening} onclick={() => void update()}>Update details on Stripe ↗</Button>
        </span>
      </div>
    </section>
    <section class="flex flex-wrap gap-x-7 gap-y-2.5 border-t border-border px-5 py-4">
      <h2 class="flex-[1_1_180px] text-sm font-semibold sm:max-w-[220px]">Stop taking payments through LogIt</h2>
      <div class="flex min-w-0 flex-[999_1_360px] flex-col items-start gap-2 text-[13px]">
        <p class="text-muted-foreground">Plans stop renewing and clients keep coaching to the end of what they paid for. Your Stripe account stays yours.</p>
        <Button size="sm" variant="outline" class="border-destructive/40 text-destructive hover:bg-destructive/5" onclick={() => (stopOpen = true)}>Stop…</Button>
      </div>
    </section>
  {/if}

  <form class="flex flex-wrap gap-x-7 gap-y-2.5 border-t border-border px-5 py-4 first:border-t-0" onsubmit={save}>
    <h2 class="flex-[1_1_180px] text-sm font-semibold sm:max-w-[220px]">When a card fails</h2>
    <div class="flex min-w-0 flex-[999_1_360px] flex-col gap-3 text-[13px]">
      <p class="text-muted-foreground">Stripe tries the card again over a few days, and LogIt emails your client a link to update it. Meanwhile:</p>
      <RadioGroup.Root bind:value={settings.failRule} aria-label="When a card fails" class="flex flex-col gap-2">
        {#each rules as r (r.value)}
          <label class="flex items-start gap-2.5">
            <RadioGroup.Item value={r.value} class="mt-0.5" />
            <span class="flex flex-wrap items-center gap-1.5"><b class="font-medium">{r.title}</b>
              {#if r.value !== "keep"}
                after <input type="number" min="1" max="60" bind:value={settings.failDays} disabled={settings.failRule !== r.value} aria-label="Days unpaid"
                  class="h-[28px] w-14 rounded-[7px] border border-input bg-background px-2 text-center disabled:opacity-50" /> days
              {/if}
              <span class="text-muted-foreground">· {r.text}</span></span>
          </label>
        {/each}
      </RadioGroup.Root>
      <p class="text-xs text-muted-foreground">Your default. Change it for one client from Manage on the Clients tab. It also applies when a one-off package runs out or a monthly plan is stopped.</p>
      <h3 class="pt-2 text-sm font-semibold">Tell me</h3>
      <label class="flex items-center justify-between gap-3"><span>Email me about new payments and failed cards</span><Switch bind:checked={settings.emailOnFail} /></label>
      <label class="flex items-center justify-between gap-3"><span>Show the client a note in the app <span class="text-muted-foreground">(no price, no pay button)</span></span><Switch bind:checked={settings.showClientNote} /></label>
      <span><Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></span>
    </div>
  </form>

  <section class="flex flex-wrap gap-x-7 gap-y-2.5 border-t border-border px-5 py-4">
    <h2 class="flex-[1_1_180px] text-sm font-semibold sm:max-w-[220px]">Good to know</h2>
    <ul class="flex min-w-0 flex-[999_1_360px] flex-col gap-1.5 text-[13px] text-muted-foreground">
      <li><b class="font-medium text-foreground">Discount codes:</b> make them under Coupons in your Stripe dashboard; clients type them on Stripe's payment page.</li>
      <li><b class="font-medium text-foreground">Refunds:</b> from Manage on the Clients tab, through your Stripe account.</li>
      <li><b class="font-medium text-foreground">Receipts:</b> clients find them under Manage payment in My coach on the web.</li>
      <li><b class="font-medium text-foreground">Tax:</b> you're the seller, so VAT or income tax on these payments is yours to handle.</li>
    </ul>
  </section>
</div>

<AlertDialog.Root bind:open={stopOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop taking payments through LogIt?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if paying}{paying} {paying === 1 ? "client pays" : "clients pay"} you through LogIt. Their plans stop renewing; each keeps coaching until the end of what they paid for, then shows as "paid elsewhere", so coaching carries on unless you end it.{:else}No one pays you through LogIt right now. Offers with a paid package that haven't been taken are withdrawn.{/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
      <dt class="text-muted-foreground">Your Stripe account</dt><dd>Stays yours; LogIt stops using it</dd>
      <dt class="text-muted-foreground">Your clients</dt><dd>Told when their plan stops; talk to them about paying you another way</dd>
      <dt class="text-muted-foreground">Refunds</dt><dd>None: clients keep what they paid for</dd>
    </dl>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <Button variant="destructive" disabled={stopping} onclick={() => void stop()}>{stopping ? "Stopping…" : paying ? `Stop ${paying} ${paying === 1 ? "plan" : "plans"} and disconnect` : "Stop and disconnect"}</Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
