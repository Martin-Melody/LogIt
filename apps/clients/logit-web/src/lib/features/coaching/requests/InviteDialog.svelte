<!-- Invite someone you know (canvas K13): for people you've already talked to. They get a coach
     card in their messages with your offer, and skip the questions. The same choices as Offer a
     spot: a package, or no payment through LogIt. -->
<script lang="ts">
  import { ApiError } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { socialApi, type UserSearchResult } from "@logit/core/api/socialApi";
  import { formatMoney, type CoachPackage } from "@logit/core/domain/coachPayments";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import Avatar from "$lib/features/coaching/Avatar.svelte";

  let { open = $bindable(false), onsent }: { open?: boolean; onsent: () => Promise<void> | void } = $props();

  const NONE = "none";
  let query = $state("");
  let found = $state<UserSearchResult[]>([]);
  let picked = $state<UserSearchResult | null>(null);
  let packages = $state<CoachPackage[]>([]);
  let ready = $state(false);
  let pkg = $state(NONE);
  let message = $state("");
  let sending = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!open) return;
    query = "";
    found = [];
    picked = null;
    pkg = NONE;
    message = "";
    error = null;
    void coachPaymentsApi.overview().then((o) => {
      packages = o.packages.filter((k) => !k.hidden);
      ready = o.account.ready;
    }, () => (packages = []));
  });

  function search(q: string) {
    query = q;
    picked = null;
    clearTimeout(timer);
    const term = q.trim().replace(/^@/, "");
    if (term.length < 2) {
      found = [];
      return;
    }
    timer = setTimeout(async () => {
      // People who follow you first: they're the ones you've talked to.
      found = (await socialApi.searchUsers(term).catch(() => [])).sort((a, b) => Number(!!b.followsYou) - Number(!!a.followsYou)).slice(0, 5);
    }, 250);
  }

  async function send() {
    const username = picked?.username ?? query.trim().replace(/^@/, "");
    if (!username || sending) return;
    sending = true;
    error = null;
    try {
      await coachApi.inviteClient(username, { packageId: pkg === NONE ? null : pkg, message: message.trim() || undefined });
      toast.success(`Invite sent to @${username}`);
      open = false;
      await onsent();
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? `No one is called @${username}.` : e instanceof Error ? e.message : "Couldn't send the invite.";
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Invite someone you know</Dialog.Title>
      <Dialog.Description>For people you've already talked to. They get a coach card in their messages and skip the questions.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="invite-who">Their username</Label>
        <Input id="invite-who" value={query} oninput={(e) => search(e.currentTarget.value)} placeholder="@username" autocomplete="off" />
        {#if found.length && !picked}
          <ul class="flex flex-col rounded-[10px] border border-border" aria-label="People">
            {#each found as u (u.id)}
              <li>
                <button type="button" class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-muted/60" onclick={() => { picked = u; query = `@${u.username}`; }}>
                  <Avatar name={u.displayName || u.username} url={u.avatarUrl} size={28} />
                  <span class="flex-1"><b class="font-medium">{u.displayName || u.username}</b> <span class="text-muted-foreground">@{u.username}{u.followsYou ? " · follows you" : ""}</span></span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-package">Package</Label>
        <OptionSelect id="invite-package" bind:value={pkg}
          options={[...packages.map((k) => ({ value: k.id, label: `${k.name} · ${formatMoney(k.amountCents, k.currency)}${k.interval === "month" ? " a month" : ""}`, disabled: !ready })), { value: NONE, label: "No payment through LogIt" }]} />
        {#if packages.length && !ready}<span class="text-xs text-muted-foreground">Paid packages can be offered once Stripe is ready, in Payments.</span>{/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-message">Message <span class="font-normal text-muted-foreground">optional</span></Label>
        <Textarea id="invite-message" rows={2} maxlength={4000} bind:value={message} />
      </div>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={sending || query.trim().replace(/^@/, "").length < 2} onclick={() => void send()}>{sending ? "Sending…" : "Send invite"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
