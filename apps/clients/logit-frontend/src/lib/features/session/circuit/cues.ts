// Beeps and buzzes for the circuit countdown, so it can be followed without
// looking at the phone (it's usually on the floor during mobility work).

let ctx: AudioContext | null = null;

/** Call from a tap (Start): browsers only allow sound after a user gesture. */
export function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function beep(freq: number, ms: number, delayMs = 0): void {
  if (!ctx) return;
  try {
    const t = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  } catch {}
}

async function buzz(heavy: boolean): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: heavy ? ImpactStyle.Heavy : ImpactStyle.Light });
  } catch {}
}

/** 3, 2, 1 — and the last seconds of a hold. */
export function cueTick(): void {
  beep(660, 90);
  void buzz(false);
}

/** The hold (or rep goal) starts. */
export function cueGo(): void {
  beep(990, 280);
  void buzz(true);
}

/** A hold or a rest is over. */
export function cueEnd(): void {
  beep(880, 140);
  beep(880, 140, 200);
  void buzz(true);
}

// ── Keep the screen on while a circuit runs ───────────────────────────────────

type WakeLockSentinelLike = { release(): Promise<void> };
let lock: WakeLockSentinelLike | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl || lock) return;
    lock = await wl.request("screen");
  } catch {
    lock = null;
  }
}

function onVisible(): void {
  // The browser drops the lock when the app is hidden; take it again on return.
  if (wanted && document.visibilityState === "visible") {
    lock = null;
    void acquire();
  }
}

export function keepScreenOn(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on === wanted) return;
  wanted = on;
  if (on) {
    document.addEventListener("visibilitychange", onVisible);
    void acquire();
  } else {
    document.removeEventListener("visibilitychange", onVisible);
    const l = lock;
    lock = null;
    void l?.release().catch(() => {});
  }
}
