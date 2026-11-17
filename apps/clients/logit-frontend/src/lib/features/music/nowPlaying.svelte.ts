import type { PluginListenerHandle } from "@capacitor/core";
import { log } from "@logit/core/platform/log";
import { MediaControl, isMusicControlSupported, type NowPlaying } from "$lib/platform/mediaControl";
import type { WorkoutPlaylist } from "./workoutPlaylists";

/**
 * What the playing music app is doing, for the music bar. Watching runs only while a bar is
 * on screen (ref-counted), and is re-checked when the app comes back to the front, since
 * that's when someone has just switched on Notification access.
 */
class MusicState {
  readonly supported = isMusicControlSupported();
  /** null until asked. */
  granted = $state<boolean | null>(null);
  np = $state<NowPlaying>({ available: false });
  /** Ticks every second while playing, so the position moves. */
  now = $state(Date.now());

  get positionMs(): number {
    const np = this.np;
    if (!np.available) return 0;
    const base = np.positionMs ?? 0;
    if (!np.isPlaying || !np.positionAtMs) return base;
    const moved = base + (this.now - np.positionAtMs) * (np.speed || 1);
    return Math.max(0, np.durationMs ? Math.min(np.durationMs, moved) : moved);
  }
}

export const music = new MusicState();

let watchers = 0;
let listener: PluginListenerHandle | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

function apply(np: NowPlaying) {
  music.np = np;
  music.now = Date.now();
  if (np.available && np.isPlaying) {
    ticker ??= setInterval(() => (music.now = Date.now()), 1000);
  } else if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function begin() {
  try {
    listener ??= await MediaControl.addListener("nowPlaying", apply);
    const res = await MediaControl.startWatching();
    music.granted = res.granted;
    apply(res);
  } catch (e) {
    log.warn("music", "Couldn't start watching media sessions", { error: String(e) });
    music.granted = false;
  }
}

async function end() {
  if (ticker) clearInterval(ticker);
  ticker = null;
  try {
    await listener?.remove();
    listener = null;
    await MediaControl.stopWatching();
  } catch {
    // Already gone.
  }
}

function onVisible() {
  if (document.visibilityState === "visible" && watchers > 0) void begin();
}

/** Start following the music app; call the returned function to stop. */
export function watchMusic(): () => void {
  if (!music.supported) return () => {};
  watchers++;
  if (watchers === 1) {
    document.addEventListener("visibilitychange", onVisible);
    void begin();
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    watchers--;
    if (watchers === 0) {
      document.removeEventListener("visibilitychange", onVisible);
      void end();
    }
  };
}

/** Whether Notification access is on, without starting to watch. */
export async function refreshAccess(): Promise<boolean> {
  if (!music.supported) return false;
  try {
    music.granted = (await MediaControl.isAccessGranted()).granted;
  } catch {
    music.granted = false;
  }
  return music.granted;
}

async function run(what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    log.warn("music", `Music ${what} failed`, { error: String(e) });
  }
}

export const musicControls = {
  togglePlay: () =>
    run("play/pause", async () => {
      const playing = music.np.isPlaying;
      // Show it straight away; the app's own update follows.
      music.np = { ...music.np, isPlaying: !playing, positionMs: music.positionMs, positionAtMs: Date.now() };
      await (playing ? MediaControl.pause() : MediaControl.play());
    }),
  next: () => run("next", () => MediaControl.next()),
  previous: () => run("previous", () => MediaControl.previous()),
  seekTo: (positionMs: number) =>
    run("seek", async () => {
      const max = music.np.durationMs || Number.MAX_SAFE_INTEGER;
      const p = Math.max(0, Math.min(max, Math.round(positionMs)));
      music.np = { ...music.np, positionMs: p, positionAtMs: Date.now() };
      await MediaControl.seekTo({ positionMs: p });
    }),
  seekBy: (deltaMs: number) => musicControls.seekTo(music.positionMs + deltaMs),
  pause: () => run("pause", () => MediaControl.pause()),
  openApp: () => run("open app", () => MediaControl.openPlayingApp()),
  openAccessSettings: () => run("open settings", () => MediaControl.openAccessSettings()),
};

/**
 * Start a saved playlist: in the background when the app's session can take it (Spotify,
 * when it's been opened before), otherwise by opening the link in the app.
 */
export async function startPlaylist(p: WorkoutPlaylist): Promise<"started" | "opened" | "failed"> {
  if (!music.supported) {
    window.open(p.url, "_blank", "noopener");
    return "opened";
  }
  try {
    const res = await MediaControl.playLink({
      url: p.url,
      playUri: p.playUri,
      packageName: p.packageName,
    });
    return res.started ? "started" : res.opened ? "opened" : "failed";
  } catch (e) {
    log.warn("music", "Couldn't start playlist", { error: String(e) });
    return "failed";
  }
}
