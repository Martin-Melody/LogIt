<!-- "Get Logit on your phone": a QR to the Play Store listing, for a computer screen (W5, W6).
     It only opens the listing; it never signs the phone in (decided 2026-11-18: a QR that signs
     in could be photographed by anyone near the screen). The person signs in on the phone. -->
<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { apiClient } from "@logit/core/api/client";

  let { title = "Get Logit on your phone", children }: { title?: string; children?: import("svelte").Snippet } = $props();

  const PLAY_URL = "https://play.google.com/store/apps/details?id=ie.logit.app";
  const username = apiClient.getUser()?.username;
  let svg = $state<string | null>(null);

  onMount(async () => {
    svg = await QRCode.toString(PLAY_URL, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  });
</script>

<section class="flex w-full min-w-0 flex-col gap-4 rounded-2xl bg-[#0f172a] p-6 text-slate-50">
  <h2 class="text-lg font-bold">{title}</h2>
  <div class="flex flex-wrap items-center gap-[18px]">
    <div class="size-[132px] shrink-0 rounded-[10px] bg-white p-2">
      {#if svg}
        <div class="size-full [&>svg]:size-full" role="img" aria-label="QR code that opens Logit on Google Play">{@html svg}</div>
      {/if}
    </div>
    <div class="flex min-w-0 flex-[1_1_180px] flex-col gap-2">
      <span class="text-sm leading-relaxed text-slate-300">
        Scan with your phone's camera to install Logit, then sign in as <strong class="text-slate-50">@{username}</strong>.
      </span>
      <a href={PLAY_URL} target="_blank" rel="noopener" class="text-sm font-semibold text-slate-50 underline-offset-4 hover:underline">Or open Google Play</a>
    </div>
  </div>
  {@render children?.()}
</section>
