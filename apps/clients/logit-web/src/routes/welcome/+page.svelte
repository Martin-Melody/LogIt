<!-- W2 · "What brings you to LogIt on the web?" Asked once, right after signing up here. The
     answer only picks the first screen: nothing is locked to it. Someone who signed up from a
     coach's link never sees this (login sends them back to the link instead). -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient } from "@logit/core/api/client";
  import { sandbox } from "$lib/features/guide/sandbox.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Alert from "$lib/components/ui/alert";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ChartIcon from "@lucide/svelte/icons/chart-line";
  import MailIcon from "@lucide/svelte/icons/mail";

  const user = apiClient.getUser();
  let busy = $state<"coach" | null>(null);
  let error = $state<string | null>(null);
  let invited = $state(false);
  let code = $state("");

  async function coach() {
    busy = "coach";
    error = null;
    try {
      // Sample clients first, so the coaching space has something in it (W3).
      await sandbox.refresh();
      if (!sandbox.on) await sandbox.add();
      if (sandbox.error) throw new Error(sandbox.error);
      await goto("/coaching");
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't set up your coaching space. Try again.";
      busy = null;
    }
  }

  function train() {
    // Pro and Studio: their dashboard. Free: the phone-first page (W5).
    void goto(user?.tier === "Free" && !apiClient.isSelfHosted() ? "/upgrade" : "/");
  }

  /** "K7M2-Q9XH", "k7m2q9xh" or a whole link: the coach's code, as the invite page wants it. */
  function codeFrom(raw: string): string {
    const t = raw.trim();
    const fromLink = t.match(/\/c\/([A-Za-z0-9-]+)/);
    return (fromLink ? fromLink[1] : t).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  function openInvite(e: Event) {
    e.preventDefault();
    const c = codeFrom(code);
    if (c.length < 6) {
      error = "That doesn't look like a coach's code. It's 8 letters and numbers, like K7M2-Q9XH.";
      return;
    }
    void goto(`/c/${c}`);
  }

  const card =
    "flex min-h-[200px] flex-col gap-2.5 rounded-[14px] border border-border bg-card p-6 text-left transition-colors hover:border-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";
</script>


<div class="flex min-h-screen flex-col items-center gap-7 bg-background px-6 pb-10 pt-16">
  <div class="flex w-full max-w-[920px] flex-col gap-2">
    <p class="text-sm text-muted-foreground">Account created · @{user?.username}</p>
    <h1 class="text-[32px] font-bold leading-tight tracking-tight">What brings you to LogIt on the web?</h1>
    <p class="text-[15px] text-muted-foreground">We'll set things up for that. You can do the rest later.</p>
  </div>

  {#if error}
    <Alert.Root variant="destructive" class="w-full max-w-[920px]"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {/if}

  <div class="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
    <button type="button" class={card} disabled={busy !== null} onclick={coach}>
      <UsersIcon class="size-7" aria-hidden="true" />
      <span class="text-[19px] font-bold">{busy === "coach" ? "Setting up…" : "I coach people"}</span>
      <span class="text-sm leading-relaxed text-muted-foreground">
        Programs, check-ins, messages and payments for your clients, all in one place. Try it with sample clients first.
      </span>
    </button>
    <button type="button" class={card} disabled={busy !== null} onclick={train}>
      <ChartIcon class="size-7" aria-hidden="true" />
      <span class="text-[19px] font-bold">I train</span>
      <span class="text-sm leading-relaxed text-muted-foreground">See every lift's trend and plan your weeks on a big screen.</span>
    </button>
    <button type="button" class={card} disabled={busy !== null} aria-expanded={invited} onclick={() => (invited = true)}>
      <MailIcon class="size-7" aria-hidden="true" />
      <span class="text-[19px] font-bold">A coach invited me</span>
      <span class="text-sm leading-relaxed text-muted-foreground">Connect with your coach and get your program on your phone.</span>
    </button>
  </div>

  {#if invited}
    <form class="flex w-full max-w-[920px] flex-wrap items-end gap-3 rounded-[14px] border border-border bg-card p-5" onsubmit={openInvite}>
      <div class="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <Label for="coach-code">Your coach's code or link</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Input id="coach-code" bind:value={code} placeholder="K7M2-Q9XH or getlogit.app/c/…" autocomplete="off" autofocus />
      </div>
      <button type="submit" class="h-10 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground">Find my coach</button>
      <p class="w-full text-xs text-muted-foreground">Or just open the link your coach sent you; it brings you to the same place.</p>
    </form>
  {/if}
</div>
