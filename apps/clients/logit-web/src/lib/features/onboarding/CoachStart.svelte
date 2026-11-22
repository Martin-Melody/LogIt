<!-- W3 · A coach's first visit: the sample clients are already in (they're the roster below),
     so this card only adds what's next. Inviting a real client (Studio; below Studio it says
     so), building a program, and payments last. Shown until there's a real client or it's
     hidden; hiding is remembered per account in this browser. -->
<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi, type InviteLink } from "@logit/core/api/coachApi";
  import { coachTrial } from "$lib/workspace";
  import { toast } from "$lib/components/ui/sonner";
  import type { CoachingOverview } from "$lib/features/coaching/coachingData";
  import CheckIcon from "@lucide/svelte/icons/check";

  let { overview }: { overview: CoachingOverview } = $props();

  const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
  const user = apiClient.getUser();
  const hideKey = `logit:coach-start-hidden:${user?.id ?? ""}`;
  const trial = coachTrial();

  let hidden = $state(false);
  let link = $state<InviteLink | null>(null);
  let making = $state(false);
  let qr = $state<string | null>(null);

  const realClients = $derived(overview.clients.filter((c) => !c.isSample).length);
  const show = $derived(!hidden && realClients === 0);
  const linkUrl = $derived(link ? `${location.origin}/c/${link.code}` : "");

  onMount(async () => {
    try {
      hidden = localStorage.getItem(hideKey) === "1";
    } catch {
      /* private window: show it */
    }
    if (!trial && !hidden) {
      try {
        link = (await coachApi.listLinks()).find((l) => l.state === "active") ?? null;
      } catch {
        /* the card still offers to make one */
      }
    }
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

  async function showQr() {
    qr = qr ? null : await QRCode.toString(linkUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  }

  const steps = $derived([
    { label: "Invite a client", done: realClients > 0 || !!link, href: trial ? null : "/coaching/links" },
    { label: "Build a program, or start from a template", done: overview.programs.length > 0, href: "/coaching/programs" },
    { label: trial ? "Payments, with Studio, when you charge clients" : "Payments: when you charge clients", done: false, href: trial ? null : "/coaching/payments", later: true },
  ]);
</script>

{#if show}
  <section class="flex flex-col gap-4" aria-labelledby="coach-start-title">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex max-w-[70ch] flex-col gap-1.5">
        <h2 id="coach-start-title" class="text-[22px] font-bold tracking-tight">Your coaching space is ready</h2>
        {#if overview.clients.some((c) => c.isSample)}
          <p class="text-sm leading-relaxed text-muted-foreground">
            Sample clients are already in, so you can see how it works: what an overdue check-in or a new PR looks like.
            They're marked Sample and go with one click.
          </p>
        {/if}
      </div>
      <button type="button" class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onclick={hide}>Hide this</button>
    </div>

    <div class="flex flex-wrap gap-4">
      <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-[14px] bg-[#0f172a] p-[18px] text-slate-50">
        <span class="text-base font-bold">Invite your first real client</span>
        {#if trial}
          <span class="text-sm leading-relaxed text-slate-300">
            Inviting real clients comes with Studio. Until then, everything works on the sample clients: programs, check-ins, messages.
          </span>
          <a href={user?.tier === "Free" ? "/upgrade" : `${MARKETING_URL}/pricing`} class="self-start rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px] font-semibold text-[#0f172a]">See Studio</a>
        {:else if link}
          <span class="text-sm leading-relaxed text-slate-300">Send them this link. They make an account and ask you to coach them; you say yes.</span>
          <div class="flex gap-2">
            <span class="min-w-0 flex-1 truncate rounded-lg bg-slate-800 px-3 py-2.5 font-mono text-[13px]">{linkUrl.replace(/^https?:\/\//, "")}</span>
            <button type="button" class="h-10 rounded-lg bg-slate-50 px-3.5 text-[13px] font-semibold text-[#0f172a]" onclick={() => void copy()}>Copy</button>
          </div>
          <button type="button" class="self-start text-[13px] text-slate-300 underline-offset-4 hover:underline" aria-expanded={!!qr} onclick={() => void showQr()}>
            {qr ? "Hide the QR code" : "In person? Show a QR code"}
          </button>
          {#if qr}
            <div class="size-[160px] rounded-[10px] bg-white p-2 [&>svg]:size-full" role="img" aria-label="QR code of your invite link">{@html qr}</div>
          {/if}
        {:else}
          <span class="text-sm leading-relaxed text-slate-300">One link for your bio, a group chat or a poster. Anyone who opens it can ask you to coach them.</span>
          <button type="button" disabled={making} class="self-start rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px] font-semibold text-[#0f172a] disabled:opacity-60" onclick={() => void makeLink()}>
            {making ? "Making it…" : "Make my invite link"}
          </button>
        {/if}
      </div>

      <div class="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-[14px] border border-border bg-card p-[18px]">
        <span class="text-[15px] font-bold">Getting set up</span>
        <ol class="flex flex-col gap-2.5">
          {#each steps as s (s.label)}
            <li class="flex items-center gap-2.5 text-sm {s.later ? 'text-muted-foreground' : ''}">
              {#if s.done}
                <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon class="size-3" aria-hidden="true" /></span>
                <span class="sr-only">Done:</span>
              {:else}
                <span class="size-5 shrink-0 rounded-full border-2 {s.later ? 'border-dashed' : ''} border-border" aria-hidden="true"></span>
              {/if}
              {#if s.href && !s.done}<a href={s.href} class="underline-offset-4 hover:underline">{s.label}</a>{:else}<span>{s.label}</span>{/if}
            </li>
          {/each}
        </ol>
      </div>
    </div>
  </section>
{/if}
