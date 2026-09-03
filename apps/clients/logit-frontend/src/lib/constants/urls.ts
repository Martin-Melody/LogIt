// Public marketing/legal site. Defaults to the production domain; override with
// VITE_MARKETING_URL at build time (e.g. the Cloudflare Pages preview URL until
// the domain is live).
export const MARKETING_URL: string =
  import.meta.env.VITE_MARKETING_URL || "https://logit.ie";

export const PRIVACY_URL = `${MARKETING_URL}/privacy`;
export const TERMS_URL = `${MARKETING_URL}/terms`;
