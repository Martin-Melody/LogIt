import { ApiError, apiBaseUrl, apiClient } from "./client";

// Photos on the server: profile pictures and progress photos now (posts, messages and stories
// later). The server keeps a re-encoded copy at /photos/<id>; see docs/deployment.md "Photos".

/** What an <img> loads: a server photo (/photos/…) on the server this app talks to; data URLs
 * and full addresses as they are. */
export function photoSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("/photos/") ? `${apiBaseUrl()}${url}` : url;
}

const CACHE_KEY = "logit:published-photos";

/** djb2 over the whole data URL: enough to tell "the same picture as last time". */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

/**
 * A picture as the server should keep it: a data URL from this device is uploaded once and its
 * /photos/ address returned (the same picture again returns the same address); a /photos/ address
 * or nothing comes back as it is. A server without photo storage (an older one) gets the data URL
 * itself, as before.
 */
export async function publishPhoto(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith("data:")) return value;
  const key = `${apiBaseUrl()}|${hash(value)}`;
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {}
  if (cache[key]) return cache[key]!;
  try {
    const form = new FormData();
    form.append("file", await (await fetch(value)).blob(), "photo.jpg");
    const { url } = await apiClient.fetch<{ url: string }>("/photos", { method: "POST", body: form });
    // Only the last few: a replaced picture is deleted on the server anyway.
    const kept = Object.entries(cache).slice(-7);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries([...kept, [key, url]])));
    return url;
  } catch (e) {
    // An older server has no /photos: keep sending the picture itself. Anything else (offline,
    // too many uploads) fails the publish, which is tried again later.
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return value;
    throw e;
  }
}
