// Everything on the site that will change: links, addresses, prices.

export const SITE_NAME = "LogIt";
export const SITE_URL = "https://getlogit.app";
export const CONTACT_EMAIL = "hello@getlogit.app";
export const PRIVACY_EMAIL = "privacy@getlogit.app";

/** The Play Store listing. Works once the app is published (applicationId ie.logit.app). */
export const PLAY_URL = "https://play.google.com/store/apps/details?id=ie.logit.app";
/** The web dashboard (Pro and Studio). Sign-in, account and account deletion live there. */
export const DASHBOARD_URL = "https://app.getlogit.app";
export const GITHUB_URL = "https://github.com/Martin-Melody/LogIt";
export const REGISTRY_URL = "https://github.com/Martin-Melody/logit-plugin-registry";

/**
 * Plan prices as shown on the site. They must match the subscriptions set up in Play Console.
 * TODO(launch): fill in once the prices are decided (docs/launch-checklist.md).
 */
export const PRICES = {
  pro: { monthly: "€ TBC", yearly: "€ TBC" },
  studio: { monthly: "€ TBC", yearly: "€ TBC" },
} as const;

/** Where the Play Store cancel option lives, worded the same everywhere. */
export const PLAY_CANCEL_PATH = "Play Store › your profile › Payments and subscriptions › Subscriptions";
