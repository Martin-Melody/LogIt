<!-- A link's QR code (canvas L1): for a poster, a business card or showing someone in the gym.
     Download it as an image, print a poster, or show it full screen. -->
<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";

  let { url, name, coach }: { url: string; name: string; coach: string } = $props();

  let svg = $state<string | null>(null);
  let full = $state(false);
  onMount(async () => {
    svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  });

  async function download() {
    const png = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a");
    a.href = png;
    a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "invite"}-qr.png`;
    a.click();
  }

  // A printable page of its own, so the poster has nothing of the dashboard on it.
  function poster() {
    const w = window.open("", "_blank");
    if (!w || !svg) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px}svg{width:70vmin;height:70vmin}h1{font-size:40px;margin:0 0 8px}p{font-size:20px;color:#444}</style>
      <h1>Coaching with ${esc(coach)}</h1><p>Scan to ask ${esc(coach)} to coach you</p>${svg}<p>${esc(url.replace(/^https?:\/\//, ""))}</p>
      <script>onload=()=>print()<\/script>`);
    w.document.close();
  }
</script>

<div class="flex flex-wrap items-center gap-4 rounded-[10px] bg-muted/50 p-3">
  <div class="size-[132px] shrink-0 rounded-[10px] bg-white p-2.5 [&>svg]:size-full" role="img" aria-label="QR code of the {name} link">
    {#if svg}{@html svg}{/if}
  </div>
  <div class="flex min-w-0 flex-[1_1_200px] flex-col gap-2">
    <p class="text-xs text-muted-foreground">For a poster, a business card or showing someone in the gym.</p>
    <div class="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onclick={() => void download()}>Download image</Button>
      <Button size="sm" variant="outline" onclick={poster}>Print a poster</Button>
      <Button size="sm" variant="outline" onclick={() => (full = true)}>Show full screen</Button>
    </div>
  </div>
</div>

<Dialog.Root bind:open={full}>
  <Dialog.Content class="flex h-[92svh] max-w-[92vw] flex-col items-center justify-center gap-4 bg-white text-black sm:max-w-[92vw]">
    <Dialog.Title class="text-2xl text-black">Scan to ask {coach} to coach you</Dialog.Title>
    <div class="aspect-square h-[70%] [&>svg]:size-full" role="img" aria-label="QR code of the {name} link">{#if svg}{@html svg}{/if}</div>
    <p class="text-sm text-neutral-600">{url.replace(/^https?:\/\//, "")}</p>
  </Dialog.Content>
</Dialog.Root>
