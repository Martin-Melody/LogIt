<!-- Share profile (design canvas PR1): your profile's link and a QR to scan. On LogIt's own
     server that's getlogit.app/@you, which opens in the app or on the web. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, Share2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import QRCode from "qrcode";
  import { Capacitor } from "@capacitor/core";
  import { apiBaseUrl, apiClient } from "@logit/core/api/client";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { reveal } from "$lib/transitions";

  const { username, onclose }: { username: string; onclose: () => void } = $props();

  // A self-hosted server has no web page for profiles: share the name and server instead.
  const hosted = !apiClient.isSelfHosted();
  // svelte-ignore state_referenced_locally (fixed for the sheet's life)
  const link = hosted ? `https://getlogit.app/@${username}` : null;
  const server = (() => { try { return new URL(apiBaseUrl()).host; } catch { return apiBaseUrl(); } })();
  // svelte-ignore state_referenced_locally
  const message = link ? `Follow me on LogIt: ${link}` : `Follow me on LogIt: @${username} on ${server}`;
  let qr = $state<string | null>(null);
  const native = Capacitor.isNativePlatform();
  const canShare = native || (typeof navigator !== "undefined" && typeof navigator.share === "function");

  onMount(async () => {
    if (link) qr = await QRCode.toDataURL(link, { margin: 1, width: 336, color: { dark: "#1c1f26", light: "#f0f2f5" } });
  });

  async function share() {
    try {
      if (native) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: "LogIt", text: message, dialogTitle: "Share profile" });
      } else {
        await navigator.share({ title: "LogIt", text: message });
      }
    } catch {
      // Cancelled.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link ?? message);
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select the link and copy it yourself.");
    }
  }
</script>

<BottomSheet label="Share profile" {onclose}>
  <div class="flex flex-col items-center gap-4 px-4 pb-2">
    <h2 class="self-start text-[17px] font-semibold">Share profile</h2>
    {#if qr}
      <img in:reveal src={qr} alt="QR code for @{username}'s profile" class="size-56 rounded-xl" />
    {/if}
    <p class="text-center text-sm text-muted-foreground">{link ?? `@${username} on ${server}`}</p>
    <div class="grid w-full grid-cols-2 gap-2">
      {#if canShare}
        <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={share}><Share2 class="size-4" /> Share</button>
      {/if}
      <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold {canShare ? '' : 'col-span-2'}" onclick={copy}><Copy class="size-4" /> Copy {link ? "link" : "name"}</button>
    </div>
  </div>
</BottomSheet>
