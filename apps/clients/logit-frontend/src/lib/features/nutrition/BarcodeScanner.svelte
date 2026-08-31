<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { X, Flashlight, FlashlightOff } from "lucide-svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  let { onResult, onClose }: { onResult: (code: string) => void; onClose: () => void } = $props();

  // Retail products — restricting formats speeds up and steadies the decode.
  const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

  let video: HTMLVideoElement | null = $state(null);
  let error = $state<string | null>(null);
  let torchSupported = $state(false);
  let torchOn = $state(false);
  let started = false;
  let done = false;

  let stream: MediaStream | null = null;
  let rafId = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let zxingControls: any = null;

  // Hide the bottom nav (its centre FAB paints above this overlay otherwise).
  onMount(() => {
    openOverlay();
    return () => closeOverlay();
  });

  /**
   * Prefer the main rear camera. Ultra-wide / tele / depth lenses can't focus on
   * a barcode held close or hand back a soft frame — that's the "always slightly
   * blurry" symptom on multi-camera phones like the Galaxy S23.
   */
  function pickBackCamera(cams: MediaDeviceInfo[]): string | undefined {
    const rear = cams.filter((d) => /back|rear|environment/i.test(d.label));
    const pool = rear.length ? rear : cams;
    const main = pool.find((d) => !/wide|ultra|tele|zoom|depth|macro|360/i.test(d.label));
    return (main ?? pool[0] ?? cams[0])?.deviceId;
  }

  function handleCode(raw: string) {
    if (done) return;
    const code = raw.replace(/\D/g, "");
    if (code.length < 6) return;
    done = true;
    teardown();
    onResult(code);
  }

  async function getStream(): Promise<MediaStream> {
    let s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      const wantId = pickBackCamera(cams);
      const curId = s.getVideoTracks()[0]?.getSettings().deviceId;
      if (wantId && wantId !== curId) {
        const better = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: wantId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        s.getTracks().forEach((t) => t.stop());
        s = better;
      }
    } catch {
      /* keep the first stream */
    }
    return s;
  }

  async function tuneTrack(track: MediaStreamTrack | undefined) {
    if (!track) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caps: any = track.getCapabilities?.() ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const advanced: any[] = [];
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }
      // A touch of zoom pushes past the lens' minimum focus distance — the S23
      // main camera can't focus closer than ~10 cm, so a close barcode is always
      // soft without it.
      if (caps.zoom && typeof caps.zoom.max === "number") {
        const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min ?? 1, 1.5));
        advanced.push({ zoom: z });
      }
      if (advanced.length) await track.applyConstraints({ advanced });
      torchSupported = !!caps.torch;
    } catch {
      /* focus / zoom / torch caps are all best-effort */
    }
  }

  async function start() {
    if (started || !video) return;
    started = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia unavailable");

      stream = await getStream();
      await tuneTrack(stream.getVideoTracks()[0]);

      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => {});

      // Prefer the platform scanner (MLKit via Chrome/WebView on Android). It's
      // far more tolerant of soft focus and angle than a pure-JS decoder.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BD = (window as any).BarcodeDetector;
      const supported: string[] = BD?.getSupportedFormats
        ? await BD.getSupportedFormats().catch(() => [])
        : [];
      const useFormats = FORMATS.filter((f) => supported.includes(f));

      if (BD && useFormats.length) {
        runNativeDetector(new BD({ formats: useFormats }));
      } else {
        await runZxing();
      }
    } catch (e) {
      console.warn("[BarcodeScanner] camera start failed", e);
      const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
      error = /permission|denied|notallowed/i.test(msg)
        ? "Camera access denied. Type the barcode instead."
        : "Couldn't start the camera. Type the barcode instead.";
    }
  }

  function runNativeDetector(detector: {
    detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
  }) {
    const tick = async () => {
      if (done || !video) return;
      try {
        const hits = await detector.detect(video);
        if (hits[0]?.rawValue) {
          handleCode(hits[0].rawValue);
          return;
        }
      } catch {
        /* transient — keep looping */
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  async function runZxing() {
    if (!video || !stream) return;
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    zxingControls = await reader.decodeFromStream(stream, video, (result, err) => {
      if (result) {
        handleCode(result.getText());
        return;
      }
      if (err && err.name && !/NotFound/.test(err.name)) {
        console.warn("[BarcodeScanner] decode error", err);
      }
    });
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      torchOn = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ torch: torchOn } as any] });
    } catch {
      torchSupported = false;
    }
  }

  function teardown() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    try {
      zxingControls?.stop();
    } catch {
      /* noop */
    }
    zxingControls = null;
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    if (video) video.srcObject = null;
  }

  function close() {
    done = true;
    teardown();
    onClose();
  }

  $effect(() => {
    if (video) void start();
  });

  onDestroy(() => {
    done = true;
    teardown();
  });
</script>

<div class="fixed inset-0 z-[100] bg-black flex flex-col">
  <div class="flex items-center justify-between px-3 py-2 text-white">
    <span class="text-sm font-medium">Scan a barcode</span>
    <div class="flex items-center gap-1">
      {#if torchSupported}
        <button
          type="button"
          class="h-8 w-8 flex items-center justify-center"
          onclick={toggleTorch}
          aria-label={torchOn ? "Turn off torch" : "Turn on torch"}
        >
          {#if torchOn}<Flashlight class="h-5 w-5" />{:else}<FlashlightOff class="h-5 w-5" />{/if}
        </button>
      {/if}
      <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={close} aria-label="Close">
        <X class="h-5 w-5" />
      </button>
    </div>
  </div>

  {#if error}
    <div class="flex-1 flex items-center justify-center px-6">
      <p class="text-sm text-white/80 text-center">{error}</p>
    </div>
  {:else}
    <div class="flex-1 relative">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={video}
        class="absolute inset-0 h-full w-full object-cover"
        autoplay
        muted
        playsinline
      ></video>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div class="w-64 h-40 border-2 border-white/70 rounded-lg"></div>
        <p class="text-xs text-white/70">Hold steady ~15&nbsp;cm from the barcode</p>
      </div>
    </div>
  {/if}
</div>
