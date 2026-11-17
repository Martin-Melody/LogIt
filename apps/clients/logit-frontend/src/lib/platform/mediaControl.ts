import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** What the playing music app reports (Android media session). See MediaControlPlugin.java. */
export type NowPlaying = {
  available: boolean;
  packageName?: string;
  /** "Spotify", "YouTube Music"… null if Android won't say. */
  appName?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  durationMs?: number;
  /** A small JPEG data URL, or null. */
  artwork?: string | null;
  isPlaying?: boolean;
  /** Position at `positionAtMs` (wall clock); it moves on by `speed` while playing. */
  positionMs?: number;
  positionAtMs?: number;
  speed?: number;
  canSeek?: boolean;
  canSkipNext?: boolean;
  canSkipPrevious?: boolean;
};

export type WatchResult = NowPlaying & { granted: boolean };

interface MediaControlPlugin {
  isAccessGranted(): Promise<{ granted: boolean }>;
  openAccessSettings(): Promise<void>;
  startWatching(): Promise<WatchResult>;
  stopWatching(): Promise<void>;
  getNowPlaying(): Promise<NowPlaying>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(opts: { positionMs: number }): Promise<void>;
  openPlayingApp(): Promise<void>;
  openLink(opts: { url: string; packageName?: string }): Promise<void>;
  playLink(opts: {
    url: string;
    playUri?: string;
    packageName?: string;
  }): Promise<{ started: boolean; opened: boolean }>;
  addListener(
    event: "nowPlaying",
    fn: (np: NowPlaying) => void,
  ): Promise<PluginListenerHandle>;
}

export const MediaControl = registerPlugin<MediaControlPlugin>("MediaControl");

/** The music bar needs Android's media sessions: the Android app only (not iOS, not the web). */
export function isMusicControlSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
