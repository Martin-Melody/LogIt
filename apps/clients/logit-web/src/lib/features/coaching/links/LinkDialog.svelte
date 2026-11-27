<!-- New link / Edit link (canvas L1): a name only you see, the package to pick for them, when it
     ends, how many people, and "Pay and start straight away" for a set program sold to anyone. -->
<script lang="ts">
  import { coachApi, type InviteLink } from "@logit/core/api/coachApi";
  import { formatMoney, type CoachPackage } from "@logit/core/domain/coachPayments";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { DateField } from "$lib/components/ui/date-field";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { guideSignal } from "$lib/features/guide/signal";

  let {
    open = $bindable(false),
    link = null,
    packages,
    paymentsReady,
    onsaved,
  }: {
    open?: boolean;
    /** Editing this one; null makes a new link. */
    link?: InviteLink | null;
    packages: CoachPackage[];
    paymentsReady: boolean;
    onsaved: (l: InviteLink) => void;
  } = $props();

  const NONE = "none";
  let name = $state("");
  let pkg = $state(NONE);
  let ends = $state<"never" | "date">("never");
  let endsOn = $state<string | undefined>(undefined);
  let max = $state("");
  let payAndStart = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  $effect(() => {
    if (!open) return;
    error = null;
    name = link?.name ?? "";
    pkg = link?.packageId ?? NONE;
    ends = link?.expiresAt ? "date" : "never";
    endsOn = link?.expiresAt ? link.expiresAt.slice(0, 10) : undefined;
    max = link?.maxUses ? String(link.maxUses) : "";
    payAndStart = !!link?.payAndStart;
  });

  async function save() {
    if (!name.trim()) return void (error = "Give the link a name.");
    if (ends === "date" && !endsOn) return void (error = "Pick the day it ends.");
    const maxUses = max.trim() ? Number(max) : null;
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return void (error = "Max people is a whole number, or empty for no limit.");
    saving = true;
    error = null;
    try {
      const packageId = pkg === NONE ? null : pkg;
      const saved = link
        ? await coachApi.editLink(link.id, {
            name: name.trim(), expiresAt: ends === "date" ? `${endsOn}T23:59:59Z` : null, maxUses, packageId,
            payAndStart: payAndStart && !!packageId, on: link.state !== "off",
          })
        : await coachApi.createLink({
            name: name.trim(), packageId, payAndStart: payAndStart && !!packageId, maxUses,
            expiresInDays: ends === "date" && endsOn ? Math.max(1, Math.ceil((Date.parse(`${endsOn}T23:59:59`) - Date.now()) / 86_400_000)) : null,
          });
      if (!link) guideSignal("link.created");
      toast.success(link ? "Link saved" : `"${saved.name}" made`);
      open = false;
      onsaved(saved);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save the link";
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{link ? "Edit link" : "New link"}</Dialog.Title>
      <Dialog.Description>Make one per place (your bio, a poster, a chat) so you know where people came from.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="link-name">Name, only you see it</Label>
        <Input id="link-name" bind:value={name} maxlength={80} placeholder="Instagram bio" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="link-package">Package to pick for them</Label>
        <OptionSelect id="link-package" bind:value={pkg}
          options={[{ value: NONE, label: "None" }, ...packages.map((k) => ({ value: k.id, label: `${k.name} · ${formatMoney(k.amountCents, k.currency)}${k.interval === "month" ? " a month" : ""}` }))]} />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <Label for="link-ends">Ends</Label>
          <OptionSelect id="link-ends" bind:value={ends} options={[{ value: "never", label: "Never" }, { value: "date", label: "On a date…" }]} />
          {#if ends === "date"}<DateField bind:value={endsOn} minIso={today} aria-label="Ends on" />{/if}
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="link-max">Max people</Label>
          <Input id="link-max" bind:value={max} inputmode="numeric" placeholder="No limit" />
        </div>
      </div>
      <label class="flex items-start justify-between gap-3 rounded-[10px] border border-border px-3.5 py-3">
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-medium">Pay and start straight away</span>
          <span class="text-xs text-muted-foreground">
            {pkg === NONE ? "Pick a package first." : !paymentsReady ? "Needs payments set up." : "Skips asking and the conversation. For a set program you sell to anyone, not one-to-one coaching."}
          </span>
        </span>
        <Switch bind:checked={payAndStart} disabled={pkg === NONE || !paymentsReady} />
      </label>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={saving} onclick={() => void save()}>{saving ? "Saving…" : link ? "Save" : "Create link"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
