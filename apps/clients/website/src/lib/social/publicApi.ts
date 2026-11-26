// The API the public social pages read (getlogit.app/forum/…, /t/…, /@name): the hosted server unless
// PUBLIC_LOGIT_API points elsewhere (a local API in development).
import { env } from "$env/dynamic/public";
import { HOSTED_API } from "@logit/core/domain/friendInvite";

export const publicApi = () => (env.PUBLIC_LOGIT_API ?? HOSTED_API).replace(/\/+$/, "");
/** A photo address from the API: its own /photos/… paths need the API in front. */
export const photoUrl = (api: string, url: string | null | undefined) => (url ? (url.startsWith("/") ? `${api}${url}` : url) : null);
/** "26 Nov", or "26 Nov 2025" for another year. */
export const shortDate = (when: string | number) => {
  const d = new Date(when);
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
