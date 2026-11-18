<!-- W1 · "Already on your phone?" A QR the signed-in phone scans to sign this browser in
     (server Features/Auth/PairingEndpoints.cs). Each code lasts 2 minutes and is used once; a
     new one comes automatically while the page is open, up to a limit, then on a click. The
     poll secret stays in this component and never reaches the URL or storage. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import QRCode from "qrcode";
  import { apiClient, type PairingState } from "@logit/core/api/client";

  let { onSignedIn }: { onSignedIn: () => void } = $props();

  const POLL_MS = 2_000;
  /** Fresh codes in a row before it waits for a click (about 10 minutes of an idle tab). */
  const AUTO_RENEWALS = 5;

  let svg = $state<string | null>(null);
  let status = $state<"loading" | "showing" | "denied" | "paused" | "unavailable">("loading");
  let renewals = 0;
  let pairing: { id: string; secret: string; expiresAt: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function fresh() {
    stop();
    stopped = false;
    status = "loading";
    try {
      const p = await apiClient.startPairing();
      pairing = { id: p.id, secret: p.secret, expiresAt: Date.parse(p.expiresAt) };
      svg = await QRCode.toString(p.qr, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
      status = "showing";
      schedule();
    } catch {
      // Too many codes from this address, an old server, or offline: email still works.
      status = "unavailable";
    }
  }

  function schedule() {
    if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function poll() {
    if (!pairing || stopped) return;
    if (document.hidden) return schedule();
    let state: PairingState;
    try {
      state = await apiClient.pollPairing(pairing.id, pairing.secret);
    } catch {
      return schedule();
    }
    if (state === "approved") {
      stop();
      onSignedIn();
    } else if (state === "denied") {
      stop();
      status = "denied";
    } else if (state === "expired" || state === "used" || Date.now() > pairing.expiresAt + 5_000) {
      if (++renewals > AUTO_RENEWALS) {
        stop();
        status = "paused";
      } else {
        void fresh();
      }
    } else {
      schedule();
    }
  }

  function again() {
    renewals = 0;
    void fresh();
  }

  onMount(() => void fresh());
  onDestroy(stop);
</script>

{#if status !== "unavailable"}
  <div class="flex items-center gap-3.5 rounded-xl border border-border bg-card p-3.5">
    <div class="relative size-[104px] shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-border">
      {#if status === "showing" && svg}
        <div class="size-full [&>svg]:size-full" role="img" aria-label="QR code to scan with the Logit app on your phone">
          {@html svg}
        </div>
      {:else}
        <div class="size-full animate-pulse rounded bg-muted" aria-hidden="true"></div>
      {/if}
      {#if status === "denied" || status === "paused"}
        <button type="button" onclick={again}
          class="absolute inset-0 flex items-center justify-center rounded-lg bg-background/90 text-xs font-semibold underline underline-offset-4">
          Show a new code
        </button>
      {/if}
    </div>
    <div class="flex min-w-0 flex-col gap-1">
      <span class="text-[15px] font-semibold">Already on your phone?</span>
      <span class="text-[13px] leading-relaxed text-muted-foreground" aria-live="polite">
        {#if status === "denied"}
          Turned down on your phone. Show a new code to try again.
        {:else if status === "paused"}
          The code ran out. Show a new one when you're ready.
        {:else}
          Open Logit, tap your account, then <strong class="font-medium text-foreground">Sign in on a computer</strong>, and scan this. No password.
        {/if}
      </span>
    </div>
  </div>
{/if}
