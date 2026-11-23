/** A YouTube link (watch, short, youtu.be, shorts, embed) as a privacy-enhanced embed URL; null
 * for anything else, so only YouTube plays inside the app. */
export function youtubeEmbedUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? null;
  }
  return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
}
