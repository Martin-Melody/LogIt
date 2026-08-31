<script lang="ts">
  import { onMount } from "svelte";
  import { X, Camera, Image as ImageIcon, LoaderCircle } from "lucide-svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { scanLabel, type LabelScanResult } from "$lib/features/nutrition/labelOcr";

  let { onResult, onClose }: { onResult: (r: LabelScanResult) => void; onClose: () => void } =
    $props();

  let phase = $state<"choose" | "working">("choose");
  let error = $state<string | null>(null);

  onMount(() => {
    openOverlay();
    return () => closeOverlay();
  });

  async function capture(source: "camera" | "gallery") {
    error = null;
    phase = "working";
    try {
      const { Camera: Cam, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Cam.getPhoto({
        resultType: CameraResultType.Uri,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        correctOrientation: true,
        quality: 90,
      });
      let path = photo.path ?? photo.webPath;
      if (!path) throw new Error("no image path from camera");
      if (/^\/[^/]/.test(path)) path = `file://${path}`;

      onResult(await scanLabel(path));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(msg)) {
        phase = "choose";
        return;
      }
      console.warn("[LabelScanner] scan failed", e);
      error = /timed out/i.test(msg)
        ? "That took too long. Try again with a closer, straighter photo."
        : "Couldn't read the label. Use a straight, well-lit photo that fills the frame.";
      phase = "choose";
    }
  }
</script>

<div class="fixed inset-0 z-[100] bg-black flex flex-col text-white">
  <div class="flex items-center justify-between px-3 py-2">
    <span class="text-sm font-medium">Scan the nutrition label</span>
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={onClose} aria-label="Close">
      <X class="h-5 w-5" />
    </button>
  </div>

  {#if phase === "working"}
    <div class="flex-1 flex flex-col items-center justify-center gap-3 text-white/80">
      <LoaderCircle class="h-6 w-6 animate-spin" />
      <p class="text-sm">Reading the label…</p>
    </div>
  {:else}
    <div class="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
      {#if error}
        <p class="text-sm text-white/80">{error}</p>
      {:else}
        <p class="text-sm text-white/70">
          Take a close, straight photo of the nutrition table (the "per 100 g" column), or pick
          one from your gallery.
        </p>
      {/if}
      <div class="flex flex-col gap-2 w-full max-w-xs">
        <button
          type="button"
          class="rounded bg-white text-black text-sm font-medium px-4 py-2.5 flex items-center justify-center gap-2"
          onclick={() => capture("camera")}
        >
          <Camera class="h-4 w-4" /> Take a photo
        </button>
        <button
          type="button"
          class="rounded border border-white/30 text-sm px-4 py-2.5 flex items-center justify-center gap-2"
          onclick={() => capture("gallery")}
        >
          <ImageIcon class="h-4 w-4" /> Choose from gallery
        </button>
      </div>
    </div>
  {/if}
</div>
