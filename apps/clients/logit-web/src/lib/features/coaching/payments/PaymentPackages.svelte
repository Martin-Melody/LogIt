<!-- Payments › Packages (canvas K1): what clients pay for. Packages work without Stripe too:
     they show on your profile, and an offer can say "No payment through LogIt". -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Textarea } from "$lib/components/ui/textarea";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import { coachPaymentsApi, type PackageInput } from "@logit/core/api/coachPaymentsApi";
  import { priceText, type CoachPackage, type PaymentsOverview } from "@logit/core/domain/coachPayments";
  import StripeCard from "./StripeCard.svelte";

  let { data, reload, stripeUrls, onclients, newOpen = $bindable(false) }: {
    data: PaymentsOverview;
    reload: () => Promise<void>;
    stripeUrls: () => { returnUrl: string; refreshUrl: string };
    onclients: () => void;
    newOpen?: boolean;
  } = $props();

  const currencySymbol = $derived(
    new Intl.NumberFormat("en-IE", { style: "currency", currency: data.account.currency.toUpperCase() })
      .formatToParts(0).find((p) => p.type === "currency")?.value ?? data.account.currency.toUpperCase(),
  );

  let editing = $state<CoachPackage | null>(null);
  let open = $state(false);
  let form = $state({ name: "", description: "", price: "", interval: "month" as "month" | "once", weeks: "12", hidden: false, showOnProfile: true });
  let saving = $state(false);
  let formError = $state<string | null>(null);

  $effect(() => {
    if (newOpen) {
      newOpen = false;
      openNew();
    }
  });

  function openNew() {
    editing = null;
    form = { name: "", description: "", price: "", interval: "month", weeks: "12", hidden: false, showOnProfile: true };
    formError = null;
    open = true;
  }
  function openEdit(p: CoachPackage) {
    editing = p;
    form = {
      name: p.name, description: p.description, price: String(p.amountCents / 100), interval: p.interval,
      weeks: String(p.weeks ?? 12), hidden: p.hidden, showOnProfile: p.showOnProfile ?? true,
    };
    formError = null;
    open = true;
  }

  async function save(e: Event) {
    e.preventDefault();
    const price = Number(form.price.replace(",", "."));
    if (!Number.isFinite(price) || price < 1) return void (formError = "Enter a price of at least 1.");
    const weeks = Number(form.weeks);
    if (form.interval === "once" && (!Number.isInteger(weeks) || weeks < 1)) return void (formError = "Enter how many weeks it lasts.");
    const input: PackageInput = {
      name: form.name.trim(), description: form.description.trim(), amountCents: Math.round(price * 100),
      interval: form.interval, weeks: form.interval === "once" ? weeks : null, hidden: form.hidden, showOnProfile: form.showOnProfile,
    };
    saving = true;
    formError = null;
    try {
      if (editing) await coachPaymentsApi.updatePackage(editing.id, input);
      else await coachPaymentsApi.createPackage(input);
      toast.success("Package saved");
      open = false;
      await reload();
    } catch (err) {
      formError = err instanceof Error ? err.message : "Couldn't save the package";
    } finally {
      saving = false;
    }
  }

  async function setShown(p: CoachPackage, showOnProfile: boolean) {
    try {
      await coachPaymentsApi.updatePackage(p.id, {
        name: p.name, description: p.description, amountCents: p.amountCents, interval: p.interval, weeks: p.weeks, hidden: p.hidden, showOnProfile,
      });
      toast.success(showOnProfile ? `${p.name} shows on your profile` : `${p.name} is only on its links now`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    }
  }

  const actionsFor = (p: CoachPackage): RowAction[] => [
    { id: "edit", label: "Edit…", run: () => openEdit(p) },
    p.showOnProfile
      ? { id: "unlist", label: "Take off your profile", run: () => void setShown(p, false) }
      : { id: "list", label: "Show on your profile", run: () => void setShown(p, true) },
  ];
</script>

<div class="flex flex-col gap-4">
  <StripeCard {data} {stripeUrls} onnew={openNew} {onclients} />

  <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Packages">
    {#each data.packages as p (p.id)}
      <ActionMenu actions={actionsFor(p)} label="More for {p.name}">
        {#snippet children({ props, more })}
          <article {...props} class="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-4 first:border-t-0 data-[state=open]:bg-muted/40 {p.hidden ? 'opacity-60' : ''}">
            <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
              <span class="flex flex-wrap items-center gap-1.5">
                <h3 class="text-[15px] font-semibold">{p.name}</h3>
                {#if p.hidden}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Hidden</span>
                {:else if p.showOnProfile}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">On your profile</span>
                {:else if p.links.length}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Only on its link</span>
                {:else}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Off your profile</span>{/if}
                {#each p.links as l (l)}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{l}</span>{/each}
              </span>
              {#if p.description}<span class="line-clamp-1 text-[13px] text-muted-foreground">{p.description.split(/\n+/).join(" · ")}</span>{/if}
            </div>
            <span class="text-[13px] font-medium tabular-nums">{priceText(p)}</span>
            <span class="w-20 text-[13px] text-muted-foreground tabular-nums">{p.clients} {p.clients === 1 ? "client" : "clients"}</span>
            <span class="flex items-center gap-1.5"><Button size="sm" variant="outline" onclick={() => openEdit(p)}>Edit</Button>{@render more()}</span>
          </article>
        {/snippet}
      </ActionMenu>
    {:else}
      <p class="px-5 py-10 text-center text-[13px] text-muted-foreground">No packages yet. Make one, then offer it when someone asks to be coached.</p>
    {/each}
  </section>
  <p class="text-xs text-muted-foreground">Without Stripe, packages still work: they show on your profile, an offer can say "No payment through LogIt", and you mark the client paid yourself.</p>
</div>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header><Dialog.Title>{editing ? `Edit ${editing.name}` : "New package"}</Dialog.Title></Dialog.Header>
    <form id="package-form" class="flex flex-col gap-4" onsubmit={save}>
      <div class="flex flex-col gap-1.5"><Label for="pkg-name">Name</Label><Input id="pkg-name" bind:value={form.name} required maxlength={80} placeholder="Monthly coaching" /></div>
      <div class="flex flex-wrap gap-3">
        <div class="flex w-28 flex-col gap-1.5"><Label for="pkg-price">Price ({currencySymbol})</Label><Input id="pkg-price" bind:value={form.price} required inputmode="decimal" placeholder="80" /></div>
        <div class="flex flex-[1_1_200px] flex-col gap-1.5"><Label for="pkg-interval">Charged</Label>
          <OptionSelect id="pkg-interval" value={form.interval} onValueChange={(v) => (form.interval = v as "month" | "once")}
            options={[{ value: "month", label: "Every month" }, { value: "once", label: "Once, for a set number of weeks" }]} /></div>
        {#if form.interval === "once"}
          <div class="flex w-20 flex-col gap-1.5"><Label for="pkg-weeks">Weeks</Label><Input id="pkg-weeks" bind:value={form.weeks} inputmode="numeric" /></div>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5"><Label for="pkg-desc">What's included <span class="font-normal text-muted-foreground">shown on your profile and offers</span></Label>
        <Textarea id="pkg-desc" bind:value={form.description} maxlength={600} rows={3} placeholder="Program built for you, weekly check-in with written feedback, messages" /></div>
      <label class="flex items-center justify-between gap-3 text-[13px]"><span>Show on your profile</span><Switch bind:checked={form.showOnProfile} /></label>
      {#if editing}
        <label class="flex items-center justify-between gap-3 text-[13px]"><span>Hidden <span class="block text-xs text-muted-foreground">Comes off its links and your profile; clients already on it keep paying.</span></span><Switch bind:checked={form.hidden} /></label>
        <p class="text-xs text-muted-foreground">A new price applies to people who pay from now on. Clients already paying keep their price; to move them, use Change package on Payments › Clients.</p>
      {/if}
      {#if formError}<p class="text-[13px] text-destructive" role="alert">{formError}</p>{/if}
    </form>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button type="submit" form="package-form" disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save package"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
