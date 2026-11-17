import { get } from "svelte/store";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { browser } from "$app/environment";
import { toast } from "svelte-sonner";
import { currentSession } from "$lib/stores/currentSession.store";
import { MediaControl, isMusicControlSupported } from "$lib/platform/mediaControl";
import { musicSettings } from "./musicSettings";
import { isFreshStart, pickPlaylist } from "./workoutPlaylists";
import { startPlaylist } from "./nowPlaying.svelte";

/** The last workout whose playlist was started, so a reload doesn't start it twice. */
const STARTED_KEY = "logit:music:autoplayed";
let didInit = false;

/**
 * "Start my playlist when I start a workout": watches for a new workout (however it was
 * started: split day, program, repeat, empty) and starts the playlist for its day.
 */
export function initSessionMusic(): void {
  if (!browser || didInit || !isMusicControlSupported()) return;
  didInit = true;
  let lastId: string | null = null;
  currentSession.subscribe((s) => {
    const id = s?.id ?? null;
    if (id === lastId) return;
    lastId = id;
    if (!s || s.endedAtMs || !isFreshStart(s.startedAtMs, Date.now())) return;
    const settings = get(musicSettings);
    if (!settings.autoplay) return;
    try {
      if (getAccountItem(STARTED_KEY) === s.id) return;
      setAccountItem(STARTED_KEY, s.id);
    } catch {
      // No storage: start it anyway.
    }
    const playlist = pickPlaylist(settings.playlists, s.source);
    if (!playlist) return;
    void startPlaylist(playlist).then((r) => {
      if (r === "opened") toast(`Opened ${playlist.name}. Press play there, then come back.`);
    });
  });
}

/** After Finish workout: pause the music if the user asked for that. */
export function onWorkoutFinished(): void {
  if (!isMusicControlSupported() || !get(musicSettings).pauseOnFinish) return;
  void MediaControl.pause().catch(() => {});
}
