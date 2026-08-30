<script lang="ts">
  import { onDestroy } from "svelte";
  import { X } from "lucide-svelte";

  let { onResult, onClose }: { onResult: (code: string) => void; onClose: () => void } = $props();

  let video: HTMLVideoElement | null = $state(null);
  let error = $state<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controls: any = null;

  async function start() {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!video) return;
      controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) {
          const code = result.getText().replace(/\D/g, "");
          if (code.length >= 6) {
            stop();
            onResult(code);
          }
        }
      });
    } catch (e) {
      error =
        e instanceof Error && /permission|denied|notallowed/i.test(e.message)
          ? "Camera access denied. Type the barcode instead."
          : "Couldn't start the camera. Type the barcode instead.";
    }
  }

  function stop() {
    try {
      controls?.stop();
    } catch {
      /* noop */
    }
    controls = null;
  }

  function close() {
    stop();
    onClose();
  }

  $effect(() => {
    if (video) void start();
  });

  onDestroy(stop);
</script>

<div class="fixed inset-0 z-[100] bg-black flex flex-col">
  <div class="flex items-center justify-between px-3 py-2 text-white">
    <span class="text-sm font-medium">Scan a barcode</span>
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={close} aria-label="Close">
      <X class="h-5 w-5" />
    </button>
  </div>

  {#if error}
    <div class="flex-1 flex items-center justify-center px-6">
      <p class="text-sm text-white/80 text-center">{error}</p>
    </div>
  {:else}
    <div class="flex-1 relative">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} class="absolute inset-0 h-full w-full object-cover" playsinline></video>
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-64 h-40 border-2 border-white/70 rounded-lg"></div>
      </div>
    </div>
  {/if}
</div>
