<!-- The top of Payments › Packages (canvas K17, K18, Z4): connect Stripe the first time; after
     Stripe sends the coach back, one of three cards from the account's real status (coming back
     doesn't mean it's finished: "Save for later" comes back the same way). -->
<script lang="ts">
  import OptionSelect from "$lib/components/option-select.svelte";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { PAYMENT_COUNTRIES, type PaymentsOverview } from "@logit/core/domain/coachPayments";

  let { data, stripeUrls, onnew, onclients }: {
    data: PaymentsOverview;
    stripeUrls: () => { returnUrl: string; refreshUrl: string };
    onnew: () => void;
    onclients: () => void;
  } = $props();

  const account = $derived(data.account);
  let country = $state("ie");
  let connecting = $state(false);
  async function connect() {
    connecting = true;
    try {
      location.href = (await coachPaymentsApi.connect({ country, ...stripeUrls() })).url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe");
      connecting = false;
    }
  }

  // ready · checking (given everything, Stripe still checking) · unfinished (left before the end)
  const status = $derived(account.ready ? "ready" : account.requirementsDue || account.needs ? "unfinished" : "checking");
</script>

{#if !account.connected}
  <section aria-labelledby="get-paid" class="rounded-[12px] border border-border bg-card px-6 pb-2 pt-5">
    <h2 id="get-paid" class="text-[19px] font-bold tracking-tight">Get paid through LogIt</h2>
    <p class="mb-3.5 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Optional. Only if clients pay you through LogIt.{#if account.stopped}{" "}You stopped taking payments through LogIt; connecting again picks up your Stripe account.{/if}</p>
    <ol>
      <li class="flex gap-3.5 border-t border-border py-[18px]">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">1</span>
        <div class="flex flex-1 flex-col gap-3">
          <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">Connect Stripe</span><span class="text-[13px] leading-relaxed text-muted-foreground">Clients pay with card or Google Pay and the money goes straight to your bank. Stripe charges its normal card fees; LogIt takes nothing.</span></span>
          <label class="flex max-w-xs flex-col gap-1.5 text-xs font-medium text-muted-foreground">Where your business is
            <OptionSelect bind:value={country} aria-label="Where your business is" options={PAYMENT_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
            <span class="font-normal">Sets your currency. It can't be changed later.</span>
          </label>
          <p class="text-xs leading-relaxed text-muted-foreground">On Stripe's page you give your details, ID and the bank account to pay into; what's asked depends on your country. Already use Stripe? Sign in there and it can reuse your details. Stop any time with "Save for later" and pick up where you left off.</p>
          <span><Button disabled={connecting || !data.configured} onclick={() => void connect()}>{connecting ? "Opening Stripe…" : "Continue to Stripe ↗"}</Button></span>
        </div>
      </li>
      <li class="flex gap-3.5 border-t border-border py-[18px] opacity-55">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold text-muted-foreground">2</span>
        <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">Make a package</span><span class="text-[13px] leading-relaxed text-muted-foreground">What clients pay for: monthly coaching, or a block of weeks.</span></span>
      </li>
      <li class="flex gap-3.5 border-t border-border py-[18px] opacity-55">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold text-muted-foreground">3</span>
        <span class="flex flex-col gap-0.5"><span class="text-[15px] font-semibold">Offer it</span><span class="text-[13px] leading-relaxed text-muted-foreground">When someone asks to be coached, offer them a spot with a package. They pay when they take it.</span></span>
      </li>
    </ol>
    <div class="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pb-3 pt-3.5">
      <span class="text-[13px] text-muted-foreground">Clients already pay you another way? You don't need Stripe for them.</span>
      <Button variant="outline" size="sm" onclick={onclients}>Mark them as paid elsewhere</Button>
    </div>
  </section>
{:else if status === "ready"}
  {#if !data.packages.length}
    <section class="flex flex-wrap items-center gap-3 rounded-[12px] border border-success/30 bg-card px-[18px] py-4">
      <span class="flex flex-[1_1_300px] flex-col gap-0.5">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-success">Everything Stripe needs</span>
        <span class="text-[15px] font-semibold">You can take payments</span>
        <span class="text-[13px] text-muted-foreground">"{account.displayName ?? "Your account"}" · prices in {account.currency.toUpperCase()}</span>
      </span>
      <Button onclick={onnew}>Make your first package</Button>
    </section>
  {/if}
{:else if status === "checking"}
  <section class="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-card px-[18px] py-4">
    <span class="flex flex-[1_1_300px] flex-col gap-0.5">
      <span class="text-[15px] font-semibold">Stripe is checking your details</span>
      <span class="text-[13px] text-muted-foreground">Clients can't pay you yet. It shows here, and Stripe emails you, when it's done. You can make packages meanwhile.</span>
    </span>
    <Button variant="outline" onclick={onnew}>Make a package</Button>
  </section>
{:else}
  <section class="flex flex-wrap items-center gap-3 rounded-[12px] border border-warning/40 bg-card px-[18px] py-4">
    <span class="flex flex-[1_1_300px] flex-col gap-0.5">
      <span class="text-[15px] font-semibold">Setup isn't finished</span>
      <span class="text-[13px] text-muted-foreground">Clients can't pay you until it is. What you entered is kept.{#if account.needs}{" "}Stripe says: "{account.needs}"{/if}</span>
    </span>
    <Button disabled={connecting} onclick={() => void connect()}>{connecting ? "Opening Stripe…" : "Continue on Stripe ↗"}</Button>
  </section>
{/if}
