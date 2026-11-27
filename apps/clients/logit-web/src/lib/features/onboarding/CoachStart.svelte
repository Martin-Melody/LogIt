<!-- Today on a coach's first visits (canvas T1): one "Set up coaching" card with the four things
     that make coaching work (profile, an invite link, a program, a check-in form), payments as
     optional, then practising on sample clients and the walkthrough. It replaces the Welcome card,
     the sample-client banner and "Your coaching space is ready". Shown until the four are done
     and there's a real client, or until hidden (per account, in this browser). -->
<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi, type InviteLink } from "@logit/core/api/coachApi";
  import { SAMPLE_CLIENTS } from "@logit/core/guide/sandbox";
  import CheckIcon from "@lucide/svelte/icons/check";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import type { CoachingOverview } from "$lib/features/coaching/coachingData";
  import { guide } from "$lib/features/guide/guide.svelte";
  import { practice, sandbox } from "$lib/features/guide/sandbox.svelte";
  import { coachTrial } from "$lib/workspace";

  let { overview }: { overview: CoachingOverview } = $props();

  const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
  const user = apiClient.getUser();
  const hideKey = `logit:coach-start-hidden:${user?.id ?? ""}`;
  const trial = coachTrial();

  let hidden = $state(false);
  let loaded = $state(false);
  let hasProfile = $state(false);
  let realClients = $state(0);
  let link = $state<InviteLink | null>(null);
  let making = $state(false);
  let qr = $state<string | null>(null);

  const linkUrl = $derived(link ? `${location.origin}/c/${link.code}` : "");

  onMount(async () => {
    try {
      hidden = localStorage.getItem(hideKey) === "1";
    } catch {
      /* private window: show it */
    }
    // Counted from the server, so it's right whichever way Practice view is set.
    const [profile, clients, links] = await Promise.all([
      coachApi.getCoachProfile().catch(() => null),
      coachApi.listClients().catch(() => []),
      trial ? Promise.resolve([]) : coachApi.listLinks().catch(() => []),
    ]);
    hasProfile = !!profile?.profile;
    realClients = clients.filter((c) => !c.client.isSample).length;
    link = links.find((l) => l.state === "active") ?? null;
    loaded = true;
  });

  function hide() {
    hidden = true;
    try {
      localStorage.setItem(hideKey, "1");
    } catch {
      /* fine: hidden for this visit */
    }
  }

  async function makeLink() {
    making = true;
    try {
      link = await coachApi.createLink({ name: "My invite link" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make the link");
    } finally {
      making = false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  }

  async function toggleQr() {
    qr = qr ? null : await QRCode.toString(linkUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  }

  const steps = $derived([hasProfile, !!link || realClients > 0, overview.programs.length > 0, overview.schedules.length > 0]);
  const done = $derived(steps.filter(Boolean).length);
  const show = $derived(loaded && !hidden && (done < 4 || realClients === 0));
</script>

{#snippet tick(isDone: boolean)}
  {#if isDone}
    <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon class="size-3.5" aria-hidden="true" /></span>
    <span class="sr-only">Done:</span>
  {:else}
    <span class="mt-0.5 size-6 shrink-0 rounded-full border-2 border-border" aria-hidden="true"></span>
  {/if}
{/snippet}

{#if show}
  <section class="flex flex-col rounded-[14px] border border-border bg-card" aria-labelledby="coach-start-title">
    <header class="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
      <span class="flex items-baseline gap-3">
        <h2 id="coach-start-title" class="text-lg font-bold tracking-tight">Set up coaching</h2>
        <span class="text-[13px] text-muted-foreground tabular-nums">{done} of 4 done</span>
      </span>
      <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={hide}>Hide this</Button>
    </header>

    <ol class="flex flex-col">
      <li class="flex flex-wrap items-start gap-3 border-t border-border px-5 py-3.5">
        {@render tick(steps[0]!)}
        <span class="min-w-0 flex-[1_1_260px]"><b class="block text-sm font-semibold">Your coaching profile</b>
          <span class="text-[13px] text-muted-foreground">What you coach, where, who it suits, and your prices, on your profile.</span></span>
        <Button size="sm" variant={steps[0] ? "outline" : "default"} href="/coaching/profile">{steps[0] ? "Edit it" : "Write it"}</Button>
      </li>

      <li class="flex flex-wrap items-start gap-3 border-t border-border px-5 py-3.5">
        {@render tick(steps[1]!)}
        <span class="flex min-w-0 flex-[1_1_260px] flex-col gap-2"><span><b class="block text-sm font-semibold">Your invite link</b>
          <span class="text-[13px] text-muted-foreground">
            {trial ? "Inviting real clients comes with Studio. Until then, everything works on your sample clients." : "For your bio, a group chat, or a QR code on the gym wall. People who open it ask you to coach them."}
          </span></span>
          {#if link}
            <span class="flex max-w-md gap-2">
              <span class="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-[13px]">{linkUrl.replace(/^https?:\/\//, "")}</span>
              <Button size="sm" variant="outline" onclick={() => void copy()}>Copy</Button>
              <Button size="sm" variant="outline" aria-expanded={!!qr} onclick={() => void toggleQr()}>{qr ? "Hide QR" : "QR code"}</Button>
            </span>
            {#if qr}<div class="size-[160px] rounded-[10px] bg-white p-2 [&>svg]:size-full" role="img" aria-label="QR code of your invite link">{@html qr}</div>{/if}
          {/if}
        </span>
        {#if trial}
          <Button size="sm" variant="outline" href={user?.tier === "Free" ? "/upgrade" : `${MARKETING_URL}/pricing`}>See Studio</Button>
        {:else if !link}
          <Button size="sm" variant={steps[1] ? "outline" : "default"} disabled={making} onclick={() => void makeLink()}>{making ? "Making it…" : "Make my link"}</Button>
        {:else}
          <Button size="sm" variant="outline" href="/coaching/links">All links</Button>
        {/if}
      </li>

      <li class="flex flex-wrap items-start gap-3 border-t border-border px-5 py-3.5">
        {@render tick(steps[2]!)}
        <span class="min-w-0 flex-[1_1_260px]"><b class="block text-sm font-semibold">A program to start from</b>
          <span class="text-[13px] text-muted-foreground">Start from one of LogIt's programs and change it, or build your own.</span></span>
        <span class="flex gap-2">
          <Button size="sm" variant="outline" href="/coaching/programs?start=logit">Browse programs</Button>
          {#if !steps[2]}<Button size="sm" href="/coaching/programs?new=1">Build one</Button>{/if}
        </span>
      </li>

      <li class="flex flex-wrap items-start gap-3 border-t border-border px-5 py-3.5">
        {@render tick(steps[3]!)}
        <span class="min-w-0 flex-[1_1_260px]"><b class="block text-sm font-semibold">A check-in form</b>
          <span class="text-[13px] text-muted-foreground">Questions your clients answer on a schedule, so you see how their week went.</span></span>
        <Button size="sm" variant={steps[3] ? "outline" : "default"} href="/coaching/checkins">{steps[3] ? "Check-ins" : "Make a form"}</Button>
      </li>

      <li class="flex flex-wrap items-start gap-3 border-t border-border px-5 py-3.5">
        <span class="mt-0.5 size-6 shrink-0 rounded-full border-2 border-dashed border-border" aria-hidden="true"></span>
        <span class="min-w-0 flex-[1_1_260px]"><b class="block text-sm font-semibold">Payments <span class="font-normal text-muted-foreground">· optional</span></b>
          <span class="text-[13px] text-muted-foreground">Only if clients pay you through LogIt. They pay you through Stripe; LogIt takes no cut.</span></span>
        {#if !trial}<Button size="sm" variant="outline" href="/coaching/payments">Set up payments</Button>{/if}
      </li>
    </ol>

    <div class="flex flex-wrap items-center gap-3 border-t border-border bg-muted/40 px-5 py-3.5">
      <span class="flex -space-x-1.5" aria-hidden="true">
        {#each SAMPLE_CLIENTS as s (s.key)}<span class="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold">{s.displayName[0]}</span>{/each}
      </span>
      <span class="min-w-0 flex-[1_1_300px] text-[13px]"><b class="font-semibold">Practise on sample clients.</b>
        <span class="text-muted-foreground">{SAMPLE_CLIENTS.map((s) => s.displayName).join(", ")} answer check-ins and messages while LogIt is open, so you can try a program or form before a real client sees it.</span></span>
      {#if sandbox.on}
        <Button size="sm" variant="outline" disabled={practice.on} onclick={() => practice.set(true)}>{practice.on ? "In Practice view" : "Open Practice view"}</Button>
      {:else}
        <Button size="sm" variant="outline" disabled={sandbox.busy} onclick={() => void sandbox.add()}>{sandbox.busy ? "Adding…" : "Add sample clients"}</Button>
      {/if}
      <Button size="sm" variant="ghost" onclick={() => (guide.panelOpen = true)}>Take the walkthrough</Button>
    </div>
  </section>
{/if}
