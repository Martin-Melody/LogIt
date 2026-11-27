<!-- Ask to be coached (canvas P2, K7, R1): the coach's questions, the package you're interested
     in, and, when signed out, a free account or signing in, in the same form so the answers are
     never lost. Used by /ask/{username} (a coach's profile) and /c/{code} (a free invite link),
     and to edit the answers of a request already sent. The page does the sending (onsend). -->
<script lang="ts">
  import { ApiError, apiClient } from "@logit/core/api/client";
  import type { AskQuestion } from "@logit/core/domain/coachRequest";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";

  type Pkg = { id: string; name: string; amountCents: number; currency: string; interval: "month" | "once"; weeks: number | null };

  let {
    coachName,
    questions,
    packages = [],
    answers = $bindable({}),
    interested = $bindable(null),
    signedIn,
    waitingList = false,
    editing = false,
    onsignedin,
    onsend,
  }: {
    coachName: string;
    questions: AskQuestion[];
    packages?: Pkg[];
    answers?: Record<string, string>;
    interested?: string | null;
    signedIn: boolean;
    /** The coach is full and keeps a waiting list: asking joins it (canvas A4). */
    waitingList?: boolean;
    /** Changing the answers of a request already sent. */
    editing?: boolean;
    /** Called once an account was made or signed in to, before sending. */
    onsignedin?: () => Promise<void> | void;
    onsend: (answers: Record<string, string>, interested: string | null) => Promise<void>;
  } = $props();

  const signUpHref = typeof location !== "undefined" ? `/login?next=${encodeURIComponent(location.pathname)}` : "/login";
  const first = $derived(coachName.trim().split(/\s+/)[0] || coachName);
  // Workouts are logged in the Android app; an iPhone can still message and check in (decided 26 Nov).
  const onIphone = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

  let account = $state<"new" | "existing">("new");
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let login = $state("");
  let sending = $state(false);
  let error = $state<string | null>(null);
  let inviteOnly = $state(false);

  // An "Answer …" message goes once they answer.
  $effect(() => {
    void answers;
    error = null;
  });

  const missing = $derived(questions.filter((q) => !q.optional && !(answers[q.id] ?? "").trim()));
  const answered = $derived(questions.filter((q) => (answers[q.id] ?? "").trim()).length);
  const accountReady = $derived(signedIn || (account === "new" ? !!(name.trim() && email.trim() && password) : !!(login.trim() && password)));
  const label = $derived(
    editing ? "Save my answers"
      : !signedIn && account === "existing" ? `Sign in and send to ${first}`
      : waitingList ? `Join ${first}'s waiting list` : `Send to ${first}`,
  );

  function price(p: Pkg) {
    return `${formatMoney(p.amountCents, p.currency)}${p.interval === "month" ? " a month" : p.weeks ? ` · ${p.weeks} weeks` : ""}`;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (sending) return;
    if (missing.length) {
      error = `Answer "${missing[0]!.label}".`;
      document.getElementById(`ask-${missing[0]!.id}`)?.focus();
      return;
    }
    sending = true;
    error = null;
    try {
      if (!signedIn) {
        try {
          if (account === "new") await apiClient.register("", email.trim(), password, name.trim());
          else await apiClient.login(login.trim(), password);
        } catch (err) {
          if (err instanceof ApiError && (err.code === "invite_required" || err.code === "invite_invalid")) {
            inviteOnly = true;
            account = "existing";
          }
          else if (account === "new" && err instanceof ApiError && err.status === 409) {
            account = "existing";
            login = email.trim();
            error = "That email already has an account. Sign in, and your answers go with it.";
          } else error = err instanceof Error ? err.message : "Couldn't sign you in. Try again.";
          return;
        }
        await onsignedin?.();
      }
      await onsend(answers, interested);
    } catch (err) {
      error = err instanceof Error ? err.message : `Couldn't send it to ${first}. Try again.`;
    } finally {
      sending = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-5" novalidate>
  {#each questions as q (q.id)}
    <div class="flex flex-col gap-2">
      <Label for="ask-{q.id}" class="text-sm leading-snug font-semibold">
        {q.label}{#if q.optional}<span class="ml-1.5 font-normal text-muted-foreground">Optional</span>{/if}
      </Label>
      {#if q.kind === "choice" && q.options}
        <ToggleGroup.Root id="ask-{q.id}" type="single" variant="outline" spacing={2} class="flex-wrap justify-start"
          value={answers[q.id] ?? ""} onValueChange={(v: string) => (answers = { ...answers, [q.id]: v })} aria-label={q.label}>
          {#each q.options as o (o)}
            <ToggleGroup.Item value={o} class="h-9 rounded-full px-3.5 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">{o}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      {:else}
        <Textarea id="ask-{q.id}" rows={3} maxlength={2000} value={answers[q.id] ?? ""}
          oninput={(e) => (answers = { ...answers, [q.id]: e.currentTarget.value })} class="text-[14px]" />
      {/if}
    </div>
  {/each}

  {#if packages.length && !editing}
    <div class="flex flex-col gap-2">
      <Label for="ask-package" class="text-sm font-semibold">Which are you interested in?<span class="ml-1.5 font-normal text-muted-foreground">Optional</span></Label>
      <ToggleGroup.Root id="ask-package" type="single" variant="outline" spacing={2} class="flex-wrap justify-start"
        value={interested ?? "unsure"} onValueChange={(v: string) => (interested = v && v !== "unsure" ? v : null)} aria-label="Which are you interested in?">
        {#each packages as p (p.id)}
          <ToggleGroup.Item value={p.id} class="h-9 rounded-full px-3.5 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">{p.name} · {price(p)}</ToggleGroup.Item>
        {/each}
        <ToggleGroup.Item value="unsure" class="h-9 rounded-full px-3.5 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">Not sure yet</ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
  {/if}

  {#if !signedIn}
    <fieldset class="flex flex-col gap-3 rounded-[12px] border border-border bg-muted/40 p-4">
      {#if account === "new"}
        <legend class="px-1 text-sm font-semibold">Your free LogIt account</legend>
        <div class="flex flex-col gap-1.5"><Label for="ask-name">Name</Label><Input id="ask-name" bind:value={name} autocomplete="name" /></div>
        <div class="flex flex-col gap-1.5"><Label for="ask-email">Email</Label><Input id="ask-email" type="email" bind:value={email} autocomplete="email" /></div>
        <div class="flex flex-col gap-1.5"><Label for="ask-password">Password</Label><Input id="ask-password" type="password" bind:value={password} autocomplete="new-password" /></div>
        <Button type="button" variant="ghost" size="sm" class="self-start" onclick={() => { account = "existing"; error = null; }}>I already have an account</Button>
      {:else}
        <!-- K7: only the account part swaps; the answers above are kept. -->
        <legend class="px-1 text-sm font-semibold">Sign in to LogIt</legend>
        {#if inviteOnly}
          <p class="text-[13px] leading-relaxed">This LogIt server needs an invite code to sign up. Sign up with a code, then come back to this page.</p>
          <Button variant="outline" size="sm" class="self-start" href={signUpHref}>Sign up with a code</Button>
        {:else if answered}<p class="text-[13px] text-muted-foreground">Your {answered} {answered === 1 ? "answer is" : "answers are"} kept. Sign in and they're sent.</p>{/if}
        <div class="flex flex-col gap-1.5"><Label for="ask-login">Username or email</Label><Input id="ask-login" bind:value={login} autocomplete="username" /></div>
        <div class="flex flex-col gap-1.5">
          <span class="flex items-baseline justify-between"><Label for="ask-signin-password">Password</Label>
            <a href="/forgot-password" class="text-xs text-muted-foreground underline underline-offset-4">Forgot password?</a></span>
          <Input id="ask-signin-password" type="password" bind:value={password} autocomplete="current-password" />
        </div>
        {#if !inviteOnly}<Button type="button" variant="ghost" size="sm" class="self-start" onclick={() => { account = "new"; error = null; }}>I'm new, make an account</Button>{/if}
      {/if}
    </fieldset>
  {/if}

  {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
  <Button type="submit" size="lg" class="h-12 text-[15px] font-bold" disabled={sending || !accountReady}>
    {sending ? "Sending…" : label}
  </Button>
  {#if !editing}
    <p class="text-center text-xs leading-relaxed text-muted-foreground">
      Nothing else is shared with {first}. You only pay if {first} offers you a spot and you take it.
    </p>
    {#if onIphone}
      <p class="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed">On an iPhone: workouts can only be logged in the Android app for now. Messages and check-ins work in your browser.</p>
    {/if}
  {/if}
</form>
