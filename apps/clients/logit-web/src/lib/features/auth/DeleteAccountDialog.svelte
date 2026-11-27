<script lang="ts">
  // Deleting an account (K5, K16, K6). Someone who coaches sees what happens to each client's
  // plan and chooses refunds; someone who is coached sees what happens to their plan first.
  // Without coaching on either side it's the plain password-only delete.
  import { slide } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { apiClient, ApiError, type AccountClosing } from "@logit/core/api/client";
  import { formatMoney, shortDate } from "@logit/core/domain/coachPayments";
  import { refundable, refundFor, refundTotalText, unusedLabel, type RefundChoice } from "@logit/core/domain/accountClosing";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Alert from "$lib/components/ui/alert";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";

  let {
    open = $bindable(false),
    username,
    playWarning,
  }: {
    open?: boolean;
    username: string | undefined;
    /** Shown when a Google Play plan would go on charging (the account page knows). */
    playWarning?: import("svelte").Snippet;
  } = $props();

  let closing = $state<AccountClosing | null>(null);
  let loadError = $state<string | null>(null);
  let choice = $state<RefundChoice>("unused");
  let perClient = $state<Record<string, number>>({});
  let message = $state("");
  let password = $state("");
  let deleting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) {
      closing = null;
      loadError = null;
      choice = "unused";
      perClient = {};
      message = "";
      password = "";
      error = null;
      deleting = false;
      return;
    }
    void apiClient.getAccountClosing()
      .then((c) => (closing = c))
      .catch((e) => (loadError = e instanceof ApiError ? e.message : "Couldn't check your coaching."));
  });

  const clients = $derived(closing?.clients ?? []);
  const coaches = $derived(closing?.coaches ?? []);
  const paying = $derived(clients.filter(refundable));
  const total = $derived(refundTotalText(paying, choice, perClient));
  const anyRefund = $derived(paying.some((c) => refundFor(c, choice, perClient) > 0));
  const nowMs = $derived(closing?.nowMs ?? 0);

  const dateText = (ms: number | null) => (ms == null ? "" : shortDate(new Date(ms).toISOString()));

  function amountText(cents: number, currency: string) {
    return formatMoney(cents, currency);
  }

  function setAmount(id: string, text: string) {
    const n = Number(text.replace(",", "."));
    perClient = { ...perClient, [id]: Number.isFinite(n) ? Math.round(n * 100) : 0 };
  }

  async function confirm() {
    if (!password) return;
    deleting = true;
    error = null;
    try {
      await apiClient.deleteAccount(password, clients.length === 0 ? undefined : {
        refunds: choice === "perClient" ? "none" : choice,
        ...(choice === "perClient"
          ? { refundCents: Object.fromEntries(paying.map((c) => [c.relationshipId, refundFor(c, "perClient", perClient)])) }
          : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      await goto("/login");
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Couldn't delete your account.";
      deleting = false;
    }
  }

  const confirmLabel = $derived(
    deleting ? "Deleting…"
      : clients.length === 0 ? (coaches.length ? "Stop my plan and delete my account" : "Yes, delete this account")
      : anyRefund ? `End coaching, refund ${total}, delete` : "End coaching and delete",
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Delete your account</Dialog.Title>
      <Dialog.Description>
        This permanently deletes @{username} and everything stored with it: workouts, food, photos and messages. It can't be undone.
      </Dialog.Description>
    </Dialog.Header>

    {#if !closing && !loadError}
      <div class="flex flex-col gap-2" aria-busy="true">
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-4 w-1/2" />
      </div>
    {:else if loadError}
      <Alert.Root variant="destructive"><Alert.Description>{loadError}</Alert.Description></Alert.Root>
    {:else}
      {#if clients.length > 0}
        <section class="flex flex-col gap-4" aria-labelledby="del-coaching">
          <p id="del-coaching" class="text-sm">
            You coach {clients.length} {clients.length === 1 ? "person" : "people"}{paying.length ? `, and ${paying.length} of them pay you through LogIt` : ""}.
            Before your account goes, their coaching has to end.
          </p>

          <div class="flex gap-3">
            <span class="grid size-6 shrink-0 place-content-center rounded-full bg-muted text-xs font-semibold">1</span>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-semibold">Every plan is stopped</span>
              <span class="text-sm text-muted-foreground">No client is charged again. This happens first; if Stripe can't be reached, nothing is deleted and you can try again.</span>
            </div>
          </div>

          {#if paying.length > 0}
            <div class="flex gap-3">
              <span class="grid size-6 shrink-0 place-content-center rounded-full bg-muted text-xs font-semibold">2</span>
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <span class="text-sm font-semibold" id="del-refunds">Refunds</span>
                <RadioGroup.Root bind:value={choice} aria-labelledby="del-refunds" class="flex flex-col gap-1">
                  <Label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary">
                    <RadioGroup.Item value="unused" />
                    <span class="flex-1 text-sm">Refund the days they've paid for and won't get</span>
                    <span class="text-sm font-semibold tabular-nums">{refundTotalText(paying, "unused")}</span>
                  </Label>
                  <Label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary">
                    <RadioGroup.Item value="full" />
                    <span class="flex-1 text-sm">Refund each client's last payment in full</span>
                    <span class="text-sm font-semibold tabular-nums">{refundTotalText(paying, "full")}</span>
                  </Label>
                  <Label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary">
                    <RadioGroup.Item value="perClient" />
                    <span class="flex-1 text-sm">Choose per client</span>
                  </Label>
                </RadioGroup.Root>

                {#if choice === "perClient"}
                  <div transition:slide={{ duration: 180 }} class="overflow-x-auto rounded-lg border">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="text-left text-xs text-muted-foreground">
                          <th class="px-3 py-2 font-medium">Client</th>
                          <th class="px-3 py-2 font-medium">Paid</th>
                          <th class="px-3 py-2 font-medium">Not used</th>
                          <th class="px-3 py-2 font-medium">Refund</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each clients as c (c.relationshipId)}
                          <tr class="border-t">
                            <td class="px-3 py-2">{c.name}</td>
                            {#if refundable(c)}
                              <td class="px-3 py-2 tabular-nums">{amountText(c.lastPaidCents, c.currency)} on {dateText(c.lastPaidAtMs)}</td>
                              <td class="px-3 py-2 text-muted-foreground">{unusedLabel(c, nowMs) ?? "None"}</td>
                              <td class="px-3 py-2">
                                <Input class="h-9 w-24 tabular-nums" inputmode="decimal" aria-label="Refund for {c.name}"
                                  value={(refundFor(c, "perClient", perClient) / 100).toFixed(2)}
                                  onchange={(e) => setAmount(c.relationshipId, e.currentTarget.value)} />
                              </td>
                            {:else}
                              <td class="px-3 py-2 text-muted-foreground" colspan="3">
                                {c.state === "elsewhere" ? "Pays you another way" : c.state === "failed" ? "Card failed, unpaid" : "Nothing paid through LogIt"} · nothing to refund
                              </td>
                            {/if}
                          </tr>
                        {/each}
                        <tr class="border-t font-semibold">
                          <td class="px-3 py-2" colspan="3">Total</td>
                          <td class="px-3 py-2 tabular-nums">{total}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p class="border-t px-3 py-2 text-xs text-muted-foreground">Each box starts at the days they've paid for and won't get. A refund can't be more than they paid.</p>
                  </div>
                {/if}
                <span class="text-xs text-muted-foreground">Refunds come out of your Stripe balance. If Stripe can't make one (for example, the balance is empty), nothing is deleted and you'll see who.</span>
              </div>
            </div>
          {/if}

          <div class="flex gap-3">
            <span class="grid size-6 shrink-0 place-content-center rounded-full bg-muted text-xs font-semibold">{paying.length ? 3 : 2}</span>
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <Label for="del-message" class="text-sm font-semibold">A message to all of them <span class="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="del-message" rows={3} maxlength={2000} bind:value={message}
                placeholder="I'm closing my coaching business. Thank you all." />
              <span class="text-xs text-muted-foreground">It goes in the email that tells them their coaching has ended. Their programs, meal plans and history stay with them.</span>
            </div>
          </div>
        </section>
      {/if}

      {#each coaches as coach (coach.relationshipId)}
        <section class="flex flex-col gap-2 rounded-lg border p-3" aria-label="Coaching with {coach.name}">
          <span class="text-sm font-semibold">You're coached by {coach.name}</span>
          <div class="flex justify-between gap-3 border-t pt-2 text-sm"><span class="text-muted-foreground">Your plan with {coach.name}</span><span>Stops now, no more charges</span></div>
          {#if coach.state === "paid" && coach.paidUntilMs}
            <div class="flex justify-between gap-3 border-t pt-2 text-sm"><span class="text-muted-foreground">Paid until {dateText(coach.paidUntilMs)}</span><span>Not refunded by LogIt</span></div>
          {/if}
          <div class="flex justify-between gap-3 border-t pt-2 text-sm"><span class="text-muted-foreground">{coach.name}</span><span>Gets an email that you closed your account</span></div>
          {#if coach.state === "paid"}
            <span class="text-xs text-muted-foreground">If you want money back for the time left, ask {coach.name} before you delete.</span>
          {/if}
          <Button variant="outline" size="sm" class="self-start" href="/my-coach">Message {coach.name} first</Button>
        </section>
      {/each}

      {@render playWarning?.()}

      <div class="flex flex-col gap-2">
        <Label for="del-password" class="text-sm font-semibold">Your password</Label>
        <Input id="del-password" type="password" autocomplete="current-password" bind:value={password} />
      </div>
      {#if error}
        <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
      {/if}
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Keep my account</Button>
      <Button variant="destructive" disabled={deleting || !password || !closing} onclick={() => void confirm()}>{confirmLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
