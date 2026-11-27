<!-- Ask to be coached, in the app (canvas P2, A4): the coach's questions and the package you're
     interested in, as a sheet over their profile or a free invite code. You're signed in here.
     Sending opens the conversation with the coach (/messages/request/…). -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { X } from "lucide-svelte";
  import { sheetUp } from "$lib/transitions";
  import { backDismiss, sheetDrag } from "$lib/components/sheet/sheet";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { chip } from "$lib/components/ui/choice";
  import { coachApi, SHARE_ALL, type AskInfo } from "@logit/core/api/coachApi";
  import { firstName, type AskQuestion } from "@logit/core/domain/coachRequest";
  import { awayLine } from "@logit/core/domain/coachProfile";
  import { formatMoney } from "@logit/core/domain/coachPayments";

  let {
    open,
    username,
    code = null,
    onclose,
    onsent,
    initial = null,
  }: {
    open: boolean;
    username: string;
    /** Asking through a free invite code instead of the profile (the link's name shows to the coach). */
    code?: string | null;
    onclose: () => void;
    /** Before the conversation opens (onboarding finishes here). */
    onsent?: () => void;
    /** Editing a request already sent: its answers, and the button saves them. */
    initial?: Record<string, string> | null;
  } = $props();

  let info = $state<AskInfo | null>(null);
  let loadError = $state<string | null>(null);
  let answers = $state<Record<string, string>>({});
  let interested = $state<string | null>(null);
  let sending = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    openOverlay();
    error = null;
    if (initial) answers = { ...initial };
    void load();
    return () => closeOverlay();
  });

  async function load() {
    try {
      info = await coachApi.askInfo(username);
      loadError = null;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Couldn't open this. Check your connection.";
    }
  }

  const name = $derived(info ? info.coach.displayName || info.coach.username : "");
  const c = $derived(firstName(name));
  const questions = $derived<AskQuestion[]>(info?.questions ?? []);
  const missing = $derived(questions.find((q) => !q.optional && !(answers[q.id] ?? "").trim()));

  function set(id: string, v: string) {
    answers = { ...answers, [id]: v };
    error = null;
  }

  async function send() {
    if (sending || !info) return;
    if (missing) {
      error = `Answer "${missing.label}".`;
      return;
    }
    sending = true;
    error = null;
    try {
      const r = code
        ? await coachApi.requestCoaching(code, SHARE_ALL, answers, interested)
        : await coachApi.ask(username, answers, interested, SHARE_ALL);
      onclose();
      onsent?.();
      if (initial) return; // edited in place: the conversation is already open
      await goto(r.status === "active" ? "/clients" : `/messages/request/${r.relationshipId}?name=${encodeURIComponent(name)}`);
    } catch (e) {
      error = e instanceof Error ? e.message : `Couldn't send it to ${c}. Try again.`;
    } finally {
      sending = false;
    }
  }
</script>

{#if open}
  <button type="button" class="fixed inset-0 z-40 bg-black/40" aria-label="Close" onclick={onclose} transition:fade={{ duration: 150 }}></button>
  <div class="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    use:sheetDrag={{ onDismiss: onclose }} use:backDismiss={onclose} transition:sheetUp role="dialog" aria-modal="true" aria-labelledby="ask-title">
    <div class="flex shrink-0 items-center justify-between border-b border-border px-4 pt-3 pb-2">
      <p id="ask-title" class="text-[15px] font-semibold">{info?.full ? `Join ${c}'s waiting list` : info ? `Ask ${c} to coach you` : "Ask to be coached"}</p>
      <button type="button" class="flex size-11 items-center justify-center text-muted-foreground" onclick={onclose} aria-label="Close"><X class="size-5" /></button>
    </div>

    <div class="flex flex-col gap-5 overflow-y-auto px-4 py-4">
      {#if loadError}
        <p class="text-sm text-muted-foreground">{loadError}</p>
      {:else if !info}
        <p class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="size-4" /> Loading {username}'s questions…</p>
      {:else if info.full && info.whenFull === "stop"}
        <p class="text-[15px]">{c} isn't taking new clients right now.{info.expectSpots ? ` ${c} expects spots in ${info.expectSpots}.` : ""}</p>
      {:else}
        <p class="text-[13px] text-muted-foreground">
          {info.full ? `${c} is full right now${info.expectSpots ? ` and expects spots in ${info.expectSpots}` : ""}. ` : ""}{c} reads these before replying. Only {c} sees your answers.
        </p>
        {#if awayLine(info.awayUntil, c)}<p class="rounded-lg bg-muted px-3 py-2.5 text-[14px]">{awayLine(info.awayUntil, c)}</p>{/if}
        {#each questions as q (q.id)}
          <div class="flex flex-col gap-2">
            <span id="q-{q.id}" class="text-[15px] font-semibold leading-snug">{q.label}{#if q.optional}<span class="ml-1.5 text-sm font-normal text-muted-foreground">Optional</span>{/if}</span>
            {#if q.kind === "choice" && q.options}
              <div role="radiogroup" aria-labelledby="q-{q.id}" class="flex flex-wrap gap-2">
                {#each q.options as o (o)}
                  <button type="button" role="radio" aria-checked={answers[q.id] === o} class={chip(answers[q.id] === o)} onclick={() => set(q.id, o)}>{o}</button>
                {/each}
              </div>
            {:else}
              <Textarea aria-labelledby="q-{q.id}" rows={3} maxlength={2000} value={answers[q.id] ?? ""} oninput={(e) => set(q.id, e.currentTarget.value)} class="text-[15px]" />
            {/if}
          </div>
        {/each}
        {#if info.packages.length && !initial}
          <div class="flex flex-col gap-2">
            <span id="q-package" class="text-[15px] font-semibold">Which are you interested in?<span class="ml-1.5 text-sm font-normal text-muted-foreground">Optional</span></span>
            <div role="radiogroup" aria-labelledby="q-package" class="flex flex-wrap gap-2">
              {#each info.packages as p (p.id)}
                <button type="button" role="radio" aria-checked={interested === p.id} class={chip(interested === p.id)} onclick={() => (interested = p.id)}>
                  {p.name} · {formatMoney(p.amountCents, p.currency)}{p.interval === "month" ? " a month" : ""}
                </button>
              {/each}
              <button type="button" role="radio" aria-checked={interested === null} class={chip(interested === null)} onclick={() => (interested = null)}>Not sure yet</button>
            </div>
          </div>
        {/if}
        <p class="text-[13px] leading-relaxed text-muted-foreground">Nothing else is shared with {c}. You only pay if {c} offers you a spot and you take it.</p>
      {/if}
    </div>

    {#if info && !(info.full && info.whenFull === "stop") && !loadError}
      <div class="shrink-0 border-t border-border px-4 py-3">
        {#if error}<p class="pb-2 text-sm text-destructive" role="alert">{error}</p>{/if}
        <button type="button" class="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
          disabled={sending} onclick={() => void send()}>
          {#if sending}<Spinner class="size-4" />{/if}
          {initial ? "Save my answers" : info.full ? `Join ${c}'s waiting list` : `Send to ${c}`}
        </button>
      </div>
    {/if}
  </div>
{/if}
