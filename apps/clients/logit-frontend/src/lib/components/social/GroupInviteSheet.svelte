<!-- Invite to a group (design canvas G10): a QR for the gym wall, or share the link. It opens the
     join screen (G5). Organisers can make a new link from the group's ⋯. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, Share2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import QRCode from "qrcode";
  import { Capacitor } from "@capacitor/core";
  import { groupLink } from "@logit/core/api/groupsApi";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { reveal } from "$lib/transitions";

  const { name, code, onclose }: { name: string; code: string; onclose: () => void } = $props();

  const link = $derived(groupLink(code));
  let qr = $state<string | null>(null);
  const native = Capacitor.isNativePlatform();
  const canShare = native || (typeof navigator !== "undefined" && typeof navigator.share === "function");
  const message = $derived(`Join ${name} on LogIt: ${link}`);

  onMount(async () => {
    qr = await QRCode.toDataURL(link, { margin: 1, width: 400, color: { dark: "#1c1f26", light: "#ffffff" } });
  });

  async function share() {
    try {
      if (native) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: name, text: message, dialogTitle: `Invite to ${name}` });
      } else await navigator.share({ title: name, text: message });
    } catch {
      // Cancelled.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Select the link and copy it yourself.");
    }
  }
</script>

<BottomSheet label="Invite to {name}" {onclose}>
  <div class="flex flex-col gap-4 px-4 pb-3">
    <div class="flex flex-col gap-1.5">
      <h2 class="text-[19px] font-semibold">Invite to {name}</h2>
      <p class="text-sm leading-relaxed text-muted-foreground">Anyone with this link or QR can join. Print the QR for the gym wall, or send the link.</p>
    </div>
    {#if qr}
      <div transition:reveal class="flex flex-col items-center gap-2">
        <img src={qr} alt="QR code to join {name}" class="size-[200px] rounded-2xl bg-white p-2" />
        <span class="max-w-full truncate text-[13px] text-muted-foreground tabular-nums">getlogit.app/g#…{code.slice(-4)}</span>
      </div>
    {:else}
      <div class="mx-auto size-[200px] animate-pulse rounded-2xl bg-muted"></div>
    {/if}
    <div class="grid {canShare ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
      {#if canShare}<button type="button" class="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground" onclick={share}><Share2 class="size-[18px]" />Share</button>{/if}
      <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold {canShare ? '' : 'bg-primary text-primary-foreground border-transparent'}" onclick={copy}><Copy class="size-[18px]" />Copy link</button>
    </div>
  </div>
</BottomSheet>
