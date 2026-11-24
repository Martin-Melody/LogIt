<!-- "Invite a friend" (design canvas T3): a QR to scan and a link to share. Accepting makes you
     follow each other. No contacts are uploaded. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, Link2, RefreshCw } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import QRCode from "qrcode";
  import { Capacitor } from "@capacitor/core";
  import { friendsApi, inviteLink } from "@logit/core/api/friendsApi";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { reveal } from "$lib/transitions";

  const { onclose }: { onclose: () => void } = $props();

  let link = $state<string | null>(null);
  let qr = $state<string | null>(null);
  let error = $state(false);
  let renewing = $state(false);
  const native = Capacitor.isNativePlatform();
  const canShare = native || (typeof navigator !== "undefined" && typeof navigator.share === "function");

  async function show(code: string) {
    link = inviteLink(code);
    qr = await QRCode.toDataURL(link, { margin: 1, width: 336, color: { dark: "#1c1f26", light: "#f0f2f5" } });
  }

  async function load() {
    try {
      error = false;
      await show((await friendsApi.myInvite()).code);
    } catch {
      error = true;
    }
  }
  onMount(load);

  const message = $derived(link ? `Train with me on LogIt: ${link}` : "");

  async function share() {
    if (!link) return;
    try {
      if (native) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: "LogIt", text: message, dialogTitle: "Invite a friend" });
      } else {
        await navigator.share({ title: "LogIt", text: message });
      }
    } catch {
      // Cancelled.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Copied. Paste it into any message.");
    } catch {
      toast("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function renew() {
    renewing = true;
    try {
      await show((await friendsApi.newInvite()).code);
      toast("New link made. The old one no longer works.");
    } catch {
      toast.error("Couldn't make a new link. Try again.");
    } finally {
      renewing = false;
    }
  }
</script>

<BottomSheet label="Invite a friend" {onclose}>
  <div class="flex flex-col gap-4 px-4 pb-2">
    <div class="flex flex-col gap-1.5">
      <h2 class="text-[17px] font-semibold">Invite a friend</h2>
      <p class="text-sm leading-relaxed text-muted-foreground">You'll follow each other, see when the other is training and can cheer each other on. They set up their own training.</p>
    </div>

    {#if error}
      <p class="text-sm text-muted-foreground">Couldn't make your invite. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
    {:else if qr && link}
      <div transition:reveal class="flex flex-col items-center gap-2">
        <img src={qr} alt="QR code that opens your invite" class="size-[168px] rounded-xl" />
        <span class="text-[13px] text-muted-foreground">Scan with their phone's camera</span>
      </div>
      {#if canShare}
        <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground" onclick={share}><Link2 class="size-[18px]" />Share invite link</button>
      {:else}
        <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground" onclick={copy}><Copy class="size-[18px]" />Copy invite link</button>
      {/if}
      <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium disabled:opacity-60" disabled={renewing} onclick={renew}><RefreshCw class="size-4" />Make a new link</button>
    {:else}
      <div class="mx-auto size-[168px] animate-pulse rounded-xl bg-muted"></div>
    {/if}
    <button type="button" class="h-11 rounded-lg text-sm font-medium text-muted-foreground" onclick={onclose}>Not now</button>
    <p class="text-[13px] leading-snug text-muted-foreground">Always in Social › Find people. No contacts are uploaded.</p>
  </div>
</BottomSheet>
