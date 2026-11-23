<script lang="ts">
  // Decision D11: the web is for planning, reviewing and people, not for training. Where Overview
  // shows the next workout, this says where it's done. The QR only opens the Play listing; it never
  // signs a phone in (decided 2026-11-18: anyone near the screen could photograph it).
  import { onMount } from "svelte";
  import QRCode from "qrcode";

  const { nextTitle }: { nextTitle: string | null } = $props();
  const PLAY_URL = "https://play.google.com/store/apps/details?id=ie.logit.app";
  let svg = $state<string | null>(null);
  onMount(async () => {
    svg = await QRCode.toString(PLAY_URL, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  });
</script>

<div class="flex flex-wrap items-center gap-4 rounded-xl bg-muted/60 p-4">
  <div class="size-[88px] shrink-0 rounded-lg bg-white p-1.5">
    {#if svg}<div class="size-full [&>svg]:size-full" role="img" aria-label="QR code that opens LogIt on Google Play">{@html svg}</div>{/if}
  </div>
  <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
    <h3 class="text-sm font-semibold">Train {nextTitle ?? "it"} on your phone</h3>
    <p class="text-[13px] leading-relaxed text-muted-foreground">Workouts are logged in the LogIt app. Here you plan your weeks, fix a past session and see your progress; changes reach the phone at its next sync.</p>
  </div>
  <a href="/plan" class="inline-flex h-11 shrink-0 items-center rounded-[10px] border border-border px-4 text-sm font-medium hover:bg-muted">Edit the plan</a>
</div>
