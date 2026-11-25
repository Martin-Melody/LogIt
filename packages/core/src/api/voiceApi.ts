import { apiBaseUrl, apiClient } from "./client";

// Voice messages (friends overhaul, design canvas M5–M6, C1–C2): a recording is uploaded, then
// sent by its id like a photo. The server keeps it at /voice/<id>.

/** A voice message as a message carries it: where to play it, how long, and its waveform. */
export interface MessageVoice {
  id?: string;
  url: string;
  ms: number;
  /** One digit (0–9) per bar, measured while recording; may be empty. */
  peaks: string;
}

/** What an <audio> loads: a server recording (/voice/…) on the server this app talks to. */
export function voiceSrc(url: string): string {
  return url.startsWith("/voice/") ? `${apiBaseUrl()}${url}` : url;
}

export async function uploadVoice(recording: Blob, durationMs: number, peaks: string): Promise<MessageVoice> {
  const form = new FormData();
  form.append("file", recording, "voice");
  form.append("durationMs", String(Math.round(durationMs)));
  const res = await apiClient.fetch<{ id: string; url: string; durationMs: number }>("/voice", { method: "POST", body: form });
  return { id: res.id, url: res.url, ms: res.durationMs, peaks };
}

/** "0:11", "1:00". */
export function voiceTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Loudness samples (0–1, one every 100 ms) as `bars` digits, scaled so the loudest is 9. */
export function peaksFrom(samples: number[], bars = 32): string {
  if (samples.length === 0) return "";
  const n = Math.min(bars, samples.length);
  const buckets = Array.from({ length: n }, (_, i) => {
    const part = samples.slice(Math.floor((i * samples.length) / n), Math.floor(((i + 1) * samples.length) / n));
    return part.length ? Math.max(...part) : 0;
  });
  const top = Math.max(...buckets) || 1;
  return buckets.map((v) => Math.round((v / top) * 9)).join("");
}

export const VOICE_MAX_MS = 60_000;

/** A recording in progress. `level()` is the loudness right now (0–1) for the live waveform. */
export interface Recording {
  level(): number;
  elapsedMs(): number;
  /** Stops and returns what was recorded. */
  stop(): Promise<{ blob: Blob; durationMs: number; peaks: string }>;
  /** Stops and throws it away. */
  cancel(): void;
}

const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

/**
 * Starts recording from the microphone (asks for it the first time). Stops by itself at a
 * minute and calls `onLimit`. Throws when there's no microphone or it isn't allowed.
 */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mimeType = TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const audio = new AudioContext();
  // A new context can start suspended (no sound in, so a flat waveform) until it's resumed.
  await audio.resume().catch(() => {});
  const analyser = audio.createAnalyser();
  analyser.fftSize = 512;
  audio.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const level = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  };

  const samples: number[] = [];
  const started = performance.now();
  const sampler = setInterval(() => samples.push(level()), 100);
  const limit = setTimeout(onLimit, VOICE_MAX_MS);
  recorder.start(250);

  const finish = () => {
    clearInterval(sampler);
    clearTimeout(limit);
    stream.getTracks().forEach((t) => t.stop());
    void audio.close();
  };

  return {
    level,
    elapsedMs: () => performance.now() - started,
    stop: () =>
      new Promise((resolve) => {
        const durationMs = Math.min(performance.now() - started, VOICE_MAX_MS);
        recorder.onstop = () => {
          finish();
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), durationMs, peaks: peaksFrom(samples) });
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = finish;
      if (recorder.state !== "inactive") recorder.stop();
      else finish();
    },
  };
}
