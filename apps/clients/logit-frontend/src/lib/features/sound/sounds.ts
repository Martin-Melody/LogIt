// Logit's own sounds (design canvas S1/S2, Sound Lab), synthesised with Web Audio rather
// than stock files. Three families, picked per moment by Martin on 2026-11-17:
//   Chalk (felt on wood): rest over, 3-2-1-go, timed set done, set logged, a friend cheers
//   Iron (struck steel): 10 seconds left, new PR, week complete
//   Pulse (clean electronic): workout finished, the signature sound
// Every sound comes with a vibration, and vibration alone when sounds are off. Settings are
// per account: Timers and Celebrations on, Taps off.
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";

export type SoundId = "warn" | "rest" | "count" | "timed" | "tap" | "cheer" | "pr" | "finish" | "week";
type Family = "iron" | "chalk" | "pulse";
type Group = "timers" | "celebrations" | "taps";

/** [midi note, start (s), length (s), velocity] */
type Note = [number, number, number, number];

const SOUNDS: Record<SoundId, { family: Family; group: Group; notes: Note[] | "tap"; vibrate: number[] }> = {
  warn: { family: "iron", group: "timers", notes: [[81, 0, 0.12, 0.45]], vibrate: [30] },
  rest: { family: "chalk", group: "timers", notes: [[81, 0, 0.3, 0.9], [78, 0.14, 0.5, 0.9]], vibrate: [60, 80, 60] },
  count: { family: "chalk", group: "timers", notes: [[76, 0, 0.12, 0.55]], vibrate: [25] },
  timed: { family: "chalk", group: "timers", notes: [[74, 0, 0.25, 0.8], [69, 0.13, 0.45, 0.8]], vibrate: [60, 80, 60] },
  tap: { family: "chalk", group: "taps", notes: "tap", vibrate: [12] },
  cheer: { family: "chalk", group: "celebrations", notes: [[86, 0, 0.12, 0.5], [90, 0.07, 0.28, 0.6]], vibrate: [30, 40, 30] },
  pr: { family: "iron", group: "celebrations", notes: [[74, 0, 0.25, 0.75], [78, 0.09, 0.25, 0.8], [81, 0.18, 0.25, 0.85], [86, 0.27, 0.9, 1]], vibrate: [40, 60, 40, 60, 80] },
  finish: { family: "pulse", group: "celebrations", notes: [[74, 0, 0.3, 0.8], [81, 0.16, 0.35, 0.85], [86, 0.34, 1.3, 1], [62, 0.34, 1.6, 0.35], [69, 0.34, 1.6, 0.3]], vibrate: [50, 80, 120] },
  week: { family: "iron", group: "celebrations", notes: [[74, 0, 0.3, 0.8], [81, 0.16, 0.35, 0.85], [86, 0.34, 0.6, 1], [74, 0.75, 1.8, 0.45], [78, 0.8, 1.8, 0.45], [81, 0.85, 1.8, 0.45], [86, 0.9, 2, 0.55]], vibrate: [50, 80, 50, 80, 150] },
};

/** "Go" at the end of 3-2-1. */
const GO: Note[] = [[76, 0, 0.1, 0.7], [81, 0.09, 0.45, 0.95]];

// ── Settings ─────────────────────────────────────────────────────────────────────────────

export type SoundSettings = { timers: boolean; celebrations: boolean; taps: boolean; volume: number; vibration: boolean };
const SETTINGS_KEY = "logit:sounds:v1";
export const DEFAULT_SOUND_SETTINGS: SoundSettings = { timers: true, celebrations: true, taps: false, volume: 70, vibration: true };

export function getSoundSettings(): SoundSettings {
  try {
    const raw = getAccountItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SOUND_SETTINGS, ...(JSON.parse(raw) as Partial<SoundSettings>) } : DEFAULT_SOUND_SETTINGS;
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

export function setSoundSettings(next: SoundSettings): void {
  setAccountItem(SETTINGS_KEY, JSON.stringify(next));
}

// ── Playing ──────────────────────────────────────────────────────────────────────────────

/**
 * Plays a moment's sound and its vibration, as the settings allow. `preview` plays the sound
 * even when its group is off (the Settings play buttons).
 */
export function playSound(id: SoundId, opts: { preview?: boolean; go?: boolean } = {}): void {
  const s = getSoundSettings();
  const sound = SOUNDS[id];
  if (s.vibration && !opts.preview) void vibrate(sound.vibrate);
  if (!opts.preview && !s[sound.group]) return;
  try {
    const ctx = audio();
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = (s.volume / 100) * 0.9;
    out.connect(masterOut!);
    const t0 = ctx.currentTime + 0.02;
    if (sound.notes === "tap") tap(ctx, sound.family, t0, out);
    else for (const [m, start, len, vel] of opts.go ? GO : sound.notes) voice(ctx, sound.family, m, t0 + start, len, vel, out);
  } catch {
    // No audio here (a test, an old WebView): the vibration is enough.
  }
}

async function vibrate(pattern: number[]): Promise<void> {
  try {
    const { Haptics } = await import("@capacitor/haptics");
    // Haptics.vibrate takes one duration; a pattern is a few short ones in a row.
    for (let i = 0; i < pattern.length; i += 2) {
      await Haptics.vibrate({ duration: pattern[i]! });
      if (pattern[i + 1]) await new Promise((r) => setTimeout(r, pattern[i + 1]));
    }
  } catch {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // No vibration on this device.
    }
  }
}

let ctxRef: AudioContext | null = null;
let masterOut: AudioNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (ctxRef) {
    if (ctxRef.state === "suspended") void ctxRef.resume();
    return ctxRef;
  }
  const Ctor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctor) return null;
  ctxRef = new Ctor();
  const comp = ctxRef.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  comp.connect(ctxRef.destination);
  masterOut = comp;
  return ctxRef;
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function burst(ctx: AudioContext, dest: AudioNode, t: number, len: number, type: BiquadFilterType, freq: number, q: number, amp: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + len + 0.02);
}

function partial(ctx: AudioContext, dest: AudioNode, freq: number, t: number, attack: number, decay: number, amp: number, type: OscillatorType = "sine", detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(amp, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function voice(ctx: AudioContext, family: Family, midi: number, t: number, len: number, vel: number, dest: AudioNode) {
  const f = hz(midi);
  if (family === "iron") {
    const out = ctx.createGain();
    out.gain.value = 0.42;
    out.connect(dest);
    for (const [r, a, d] of [[1, 1, 1.6], [2.0, 0.32, 1.0], [2.76, 0.22, 0.7], [5.4, 0.09, 0.35]] as const) partial(ctx, out, f * r, t, 0.002, len * d + 0.08, a * vel);
    burst(ctx, out, t, 0.018, "bandpass", 3200, 1.2, 0.35 * vel);
    return;
  }
  if (family === "chalk") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.connect(dest);
    const out = ctx.createGain();
    out.gain.value = 0.62;
    out.connect(lp);
    for (const [r, a, d] of [[1, 1, 0.9], [4.0, 0.22, 0.28], [9.2, 0.05, 0.1]] as const) partial(ctx, out, f * r, t, 0.003, len * d + 0.05, a * vel);
    burst(ctx, out, t, 0.012, "lowpass", 900, 0.7, 0.25 * vel);
    return;
  }
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200;
  lp.connect(dest);
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(lp);
  partial(ctx, out, f, t, 0.008, len + 0.06, 0.8 * vel, "triangle", -5);
  partial(ctx, out, f, t, 0.008, len + 0.06, 0.8 * vel, "triangle", 5);
  partial(ctx, out, f * 2, t, 0.008, len * 0.6, 0.18 * vel, "sine");
}

function tap(ctx: AudioContext, family: Family, t: number, dest: AudioNode) {
  if (family === "iron") {
    partial(ctx, dest, 2350, t, 0.001, 0.05, 0.22);
    burst(ctx, dest, t, 0.012, "bandpass", 4200, 2, 0.2);
  } else if (family === "chalk") {
    partial(ctx, dest, 880, t, 0.001, 0.04, 0.35);
    burst(ctx, dest, t, 0.01, "lowpass", 700, 0.7, 0.25);
  } else {
    partial(ctx, dest, 1760, t, 0.004, 0.035, 0.22, "sine");
  }
}
