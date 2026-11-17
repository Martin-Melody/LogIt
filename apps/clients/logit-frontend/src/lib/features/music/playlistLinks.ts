/**
 * Playlist links the user pastes from Spotify or YouTube Music ("Share › Copy link").
 * LogIt never browses their library; it keeps the link and opens it in the app.
 */

export type MusicApp = "spotify" | "youtube-music" | "other";

export type ParsedLink = {
  app: MusicApp;
  /** "playlist", "album"… or "link" when the link doesn't say. */
  kind: string;
  /** The link to open, tidied (tracking parameters removed). */
  url: string;
  /** Android package to open it in, when known. */
  packageName?: string;
  /** What the app's media session can start without opening the app (Spotify only). */
  playUri?: string;
  /** For looking up the title (oEmbed). */
  oembedUrl?: string;
};

export const SPOTIFY_PACKAGE = "com.spotify.music";
export const YOUTUBE_MUSIC_PACKAGE = "com.google.android.apps.youtube.music";

const SPOTIFY_KINDS = new Set(["playlist", "album", "artist", "track", "show", "episode"]);

export const APP_LABEL: Record<MusicApp, string> = {
  spotify: "Spotify",
  "youtube-music": "YouTube Music",
  other: "Link",
};

/** The name a link gets until (or unless) its title is looked up. */
export function defaultLinkName(link: ParsedLink): string {
  const kind = link.kind === "link" ? "link" : link.kind;
  return link.app === "other" ? "Music link" : `${APP_LABEL[link.app]} ${kind}`;
}

/** Null when it isn't a link at all. Any other http(s) link is kept as "other". */
export function parseMusicLink(input: string): ParsedLink | null {
  const text = input.trim();
  if (!text) return null;

  const uri = /^spotify:(playlist|album|artist|track|show|episode):([A-Za-z0-9]+)$/.exec(text);
  if (uri) return spotify(uri[1], uri[2]);

  // People often paste "Check out this playlist https://…" from the share sheet.
  const found = /https?:\/\/\S+/i.exec(text);
  if (!found) return null;
  let u: URL;
  try {
    u = new URL(found[0]);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    // /playlist/ID, or /intl-de/playlist/ID, or /user/x/playlist/ID (old links)
    const parts = u.pathname.split("/").filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      if (SPOTIFY_KINDS.has(parts[i]) && /^[A-Za-z0-9]+$/.test(parts[i + 1])) {
        return spotify(parts[i], parts[i + 1]);
      }
    }
    return { app: "spotify", kind: "link", url: u.href, packageName: SPOTIFY_PACKAGE };
  }
  if (host === "spotify.link" || host === "spotify.app.link") {
    // Short share links: the app resolves them; we can't see what's behind them.
    return { app: "spotify", kind: "link", url: u.href, packageName: SPOTIFY_PACKAGE };
  }

  const isYtMusic = host === "music.youtube.com";
  const isYt = host === "youtube.com" || host === "m.youtube.com";
  if (isYtMusic || isYt) {
    const list = u.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]+$/.test(list)) {
      return {
        app: "youtube-music",
        kind: "playlist",
        url: `https://music.youtube.com/playlist?list=${list}`,
        packageName: YOUTUBE_MUSIC_PACKAGE,
        oembedUrl: oembed("https://www.youtube.com/oembed", `https://www.youtube.com/playlist?list=${list}`),
      };
    }
    if (isYtMusic) {
      const browse = /^\/browse\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
      return {
        app: "youtube-music",
        kind: browse?.[1].startsWith("MPREb") ? "album" : "link",
        url: u.origin + u.pathname + u.search,
        packageName: YOUTUBE_MUSIC_PACKAGE,
      };
    }
  }

  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return { app: "other", kind: "link", url: u.href };
}

function spotify(kind: string, id: string): ParsedLink {
  const url = `https://open.spotify.com/${kind}/${id}`;
  return {
    app: "spotify",
    kind,
    url,
    packageName: SPOTIFY_PACKAGE,
    playUri: `spotify:${kind}:${id}`,
    oembedUrl: oembed("https://open.spotify.com/oembed", url),
  };
}

function oembed(endpoint: string, url: string): string {
  return `${endpoint}?url=${encodeURIComponent(url)}&format=json`;
}

export type LinkDetails = { title: string | null; imageUrl: string | null };

/**
 * Title and cover from the app's public oEmbed endpoint (no account needed; both allow
 * cross-origin requests). Sends only the link itself. Nulls when offline or unknown.
 */
export async function fetchLinkDetails(
  link: ParsedLink,
  fetchFn: typeof fetch = fetch,
): Promise<LinkDetails> {
  if (!link.oembedUrl) return { title: null, imageUrl: null };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetchFn(link.oembedUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { title: null, imageUrl: null };
    const data = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
    const img = typeof data.thumbnail_url === "string" && /^https:\/\//.test(data.thumbnail_url)
      ? data.thumbnail_url
      : null;
    return { title, imageUrl: img };
  } catch {
    return { title: null, imageUrl: null };
  }
}
