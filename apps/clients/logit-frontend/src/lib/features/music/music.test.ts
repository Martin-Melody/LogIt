import { describe, expect, it, vi } from "vitest";
import {
  defaultLinkName,
  fetchLinkDetails,
  parseMusicLink,
  SPOTIFY_PACKAGE,
  YOUTUBE_MUSIC_PACKAGE,
} from "./playlistLinks";
import { isFreshStart, pickPlaylist, type WorkoutPlaylist } from "./workoutPlaylists";
import { DEFAULT_MUSIC_SETTINGS, parseMusicSettings } from "./musicSettings";
import { formatTrackTime } from "./formatTrackTime";
import type { SessionSource } from "@logit/core/domain/workout";

describe("parseMusicLink", () => {
  it("reads a Spotify playlist share link and drops the tracking part", () => {
    const l = parseMusicLink("https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP?si=abc123");
    expect(l).toMatchObject({
      app: "spotify",
      kind: "playlist",
      url: "https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP",
      playUri: "spotify:playlist:37i9dQZF1DX76Wlfdnj7AP",
      packageName: SPOTIFY_PACKAGE,
    });
    expect(l?.oembedUrl).toContain("open.spotify.com/oembed?url=");
  });

  it("finds the link inside share-sheet text and handles intl paths and albums", () => {
    expect(
      parseMusicLink("Listen to Leg Day on Spotify: https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy?si=x"),
    ).toMatchObject({ kind: "album", playUri: "spotify:album:4aawyAB9vmqN3uQ7FjRGTy" });
  });

  it("reads spotify: URIs and short links", () => {
    expect(parseMusicLink("spotify:playlist:abc123")?.url).toBe("https://open.spotify.com/playlist/abc123");
    const short = parseMusicLink("https://spotify.link/AbCdEf");
    expect(short).toMatchObject({ app: "spotify", kind: "link" });
    expect(short?.playUri).toBeUndefined();
  });

  it("turns YouTube and YouTube Music playlist links into a YouTube Music link", () => {
    for (const url of [
      "https://music.youtube.com/playlist?list=PLabc_-123&si=zzz",
      "https://www.youtube.com/playlist?list=PLabc_-123",
      "https://music.youtube.com/watch?v=xyz&list=PLabc_-123",
    ]) {
      expect(parseMusicLink(url)).toMatchObject({
        app: "youtube-music",
        kind: "playlist",
        url: "https://music.youtube.com/playlist?list=PLabc_-123",
        packageName: YOUTUBE_MUSIC_PACKAGE,
      });
    }
    // No background start for YouTube Music: its session isn't known to take URIs.
    expect(parseMusicLink("https://music.youtube.com/playlist?list=PLx")?.playUri).toBeUndefined();
  });

  it("keeps other web links and rejects text that isn't a link", () => {
    expect(parseMusicLink("https://soundcloud.com/someone/sets/gym")).toMatchObject({ app: "other" });
    expect(parseMusicLink("my gym playlist")).toBeNull();
    expect(parseMusicLink("   ")).toBeNull();
  });

  it("names a link by its app and kind until the title is known", () => {
    expect(defaultLinkName(parseMusicLink("spotify:album:x")!)).toBe("Spotify album");
    expect(defaultLinkName(parseMusicLink("https://music.youtube.com/playlist?list=a")!)).toBe(
      "YouTube Music playlist",
    );
  });
});

describe("fetchLinkDetails", () => {
  it("takes the title and an https cover from oEmbed", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ title: " Beast Mode ", thumbnail_url: "https://i.scdn.co/image/x" })),
    );
    const d = await fetchLinkDetails(parseMusicLink("spotify:playlist:abc")!, fetchFn as typeof fetch);
    expect(d).toEqual({ title: "Beast Mode", imageUrl: "https://i.scdn.co/image/x" });
  });

  it("gives nulls when offline or the link has no oEmbed", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchLinkDetails(parseMusicLink("spotify:playlist:abc")!, failing as typeof fetch)).toEqual({
      title: null,
      imageUrl: null,
    });
    expect(await fetchLinkDetails(parseMusicLink("https://spotify.link/x")!, failing as typeof fetch)).toEqual({
      title: null,
      imageUrl: null,
    });
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe("pickPlaylist", () => {
  const pl = (id: string, day?: WorkoutPlaylist["day"]): WorkoutPlaylist => ({
    id,
    name: id,
    url: `https://open.spotify.com/playlist/${id}`,
    app: "spotify",
    kind: "playlist",
    day: day ?? null,
  });
  const push = pl("push", { splitId: "s1", dayId: "d-push", dayName: "Push" });
  const legs = pl("legs", { splitId: "s1", dayId: "d-legs", dayName: "Legs" });
  const any = pl("any");
  const source = (dayId: string, parentId = "s1"): SessionSource => ({
    kind: "split",
    parentId,
    parentName: "PPL",
    dayId,
    dayName: dayId,
  });

  it("uses the playlist linked to the workout's day", () => {
    expect(pickPlaylist([any, push, legs], source("d-legs"))?.id).toBe("legs");
  });

  it("falls back to the first any-day playlist", () => {
    expect(pickPlaylist([push, any], source("d-pull"))?.id).toBe("any");
    expect(pickPlaylist([push, any], null)?.id).toBe("any");
    // Same day id in a different split doesn't count.
    expect(pickPlaylist([push, any], source("d-push", "s2"))?.id).toBe("any");
  });

  it("starts nothing when no playlist fits", () => {
    expect(pickPlaylist([push, legs], source("d-pull"))).toBeNull();
    expect(pickPlaylist([], source("d-push"))).toBeNull();
  });
});

describe("isFreshStart", () => {
  it("is true just after a start, false for a draft reloaded later", () => {
    const now = 1_000_000_000;
    expect(isFreshStart(now - 5_000, now)).toBe(true);
    expect(isFreshStart(now - 10 * 60_000, now)).toBe(false);
  });
});

describe("parseMusicSettings", () => {
  it("defaults when missing or broken", () => {
    expect(parseMusicSettings(null)).toEqual(DEFAULT_MUSIC_SETTINGS);
    expect(parseMusicSettings("{nope")).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  it("keeps good values and drops bad playlists", () => {
    const s = parseMusicSettings(
      JSON.stringify({
        barEnabled: false,
        autoplay: true,
        pauseOnFinish: "yes",
        playlists: [{ id: "a", url: "https://x", name: "A", app: "other", kind: "link" }, { id: 1 }, null],
      }),
    );
    expect(s.barEnabled).toBe(false);
    expect(s.autoplay).toBe(true);
    expect(s.pauseOnFinish).toBe(false);
    expect(s.playlists.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("formatTrackTime", () => {
  it("formats minutes and hours", () => {
    expect(formatTrackTime(238_000)).toBe("3:58");
    expect(formatTrackTime(3_725_000)).toBe("1:02:05");
    expect(formatTrackTime(-5)).toBe("0:00");
  });
});
