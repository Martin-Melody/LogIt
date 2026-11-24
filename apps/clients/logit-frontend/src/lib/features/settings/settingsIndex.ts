// Settings › the list of pages and what search can find on them. One place, so the phone list,
// the wide-screen sidebar and search can't drift apart. `id` is the element on that page that
// search jumps to and highlights (settings/+layout.svelte).

export type SettingsPageId =
  | "account" | "workout" | "progression" | "mobility" | "units" | "places" | "music" | "sounds"
  | "notifications" | "appearance" | "insights" | "plugins" | "data" | "walkthroughs" | "about";

export type SettingsPage = { id: SettingsPageId; title: string; href: string };

export const SETTINGS_GROUPS: { label: string | null; pages: SettingsPage[] }[] = [
  {
    label: "Training",
    pages: [
      { id: "workout", title: "Workout", href: "/settings/workout" },
      { id: "progression", title: "Progression", href: "/settings/progression" },
      { id: "mobility", title: "Mobility", href: "/settings/mobility" },
      { id: "units", title: "Units & equipment", href: "/settings/units" },
      { id: "places", title: "Places", href: "/settings/places" },
      { id: "music", title: "Music", href: "/settings/music" },
      { id: "sounds", title: "Sounds", href: "/settings/sounds" },
    ],
  },
  {
    label: "App",
    pages: [
      { id: "notifications", title: "Notifications", href: "/settings/notifications" },
      { id: "appearance", title: "Appearance", href: "/settings/appearance" },
      { id: "insights", title: "Insights", href: "/settings/insights" },
      { id: "plugins", title: "Plugins", href: "/settings/plugins" },
      { id: "data", title: "Backup & import", href: "/settings/data" },
    ],
  },
  {
    label: null,
    pages: [
      { id: "walkthroughs", title: "Walkthroughs", href: "/settings/walkthroughs" },
      { id: "about", title: "About", href: "/settings/about" },
    ],
  },
];

export type SettingsEntry = {
  page: string;
  href: string;
  title: string;
  detail: string;
  /** Other words people might search for. */
  keywords?: string;
};

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  { page: "Account", href: "/settings/account", title: "Account", detail: "Your name, plan and server", keywords: "profile login sign in username" },
  { page: "Account", href: "/settings/account#plan", title: "Plan", detail: "Free, Pro or Studio", keywords: "subscription billing upgrade pro studio google play" },
  { page: "Account", href: "/settings/account#settings-sync", title: "Sync now", detail: "Back up and sync this phone", keywords: "backup cloud" },
  { page: "Account", href: "/settings/account#coaching", title: "Coaching", detail: "Invites, or your clients on Studio", keywords: "coach client" },
  { page: "Account", href: "/settings/account#computer", title: "Sign in on a computer", detail: "Scan the code on app.getlogit.app", keywords: "web dashboard qr desktop" },
  { page: "Account", href: "/settings/account#password", title: "Change password", detail: "For your LogIt account" },
  { page: "Account", href: "/settings/account#switch-account", title: "Switch or add account", detail: "More than one account on this phone" },
  { page: "Account", href: "/settings/account#move-server", title: "Move to another server", detail: "Self-host, or move to getlogit.app", keywords: "self-hosted selfhost" },
  { page: "Account", href: "/settings/account#blocked", title: "Blocked accounts", detail: "People you blocked in Social", keywords: "block social" },
  { page: "Account", href: "/settings/account#sign-out", title: "Sign out", detail: "Take this account off the phone", keywords: "logout log out" },
  { page: "Account", href: "/settings/account#delete", title: "Delete account", detail: "Your account and everything on the server", keywords: "remove close" },

  { page: "Workout", href: "/settings/workout#collapse-blocks", title: "Collapse blocks by default", detail: "Exercise blocks start collapsed" },
  { page: "Workout", href: "/settings/workout#ask-effort", title: "Ask how hard each set was", detail: "One tap after each set, saved as RPE", keywords: "rpe rir effort" },
  { page: "Workout", href: "/settings/workout#rest-timer", title: "Rest timer", detail: "Default rest for each kind of set", keywords: "rest timer auto warm-up drop set amrap" },
  { page: "Workout", href: "/settings/workout#exact-alarms", title: "Rest alerts on time", detail: "Android alarms and reminders", keywords: "notification late" },
  { page: "Workout", href: "/settings/workout#circuits", title: "Circuits", detail: "Get ready and rest between exercises", keywords: "circuit countdown" },

  { page: "Progression", href: "/settings/progression", title: "Progression algorithm", detail: "How your next weights and reps are worked out", keywords: "adaptive linear suggestions next weight" },
  { page: "Progression", href: "/settings/progression#build", title: "Build an algorithm", detail: "Your own progression rules", keywords: "recipe custom code" },
  { page: "Progression", href: "/settings/progression#overrides", title: "Exercises set differently", detail: "Their own rep range or algorithm", keywords: "rep range override" },

  { page: "Mobility", href: "/settings/mobility", title: "Mobility progression", detail: "Holds, reps and load for stretching drills", keywords: "stretch flexibility hold" },
  { page: "Mobility", href: "/settings/mobility#lead-side", title: "Which side first", detail: "For one-sided drills", keywords: "left right unilateral" },

  { page: "Units & equipment", href: "/settings/units#units", title: "Weight and height units", detail: "kg or lb, cm or in", keywords: "kg lb lbs pounds kilograms cm inches" },
  { page: "Units & equipment", href: "/settings/units#bar-weight", title: "Bar weight", detail: "Used for the plate breakdown", keywords: "barbell plate" },
  { page: "Units & equipment", href: "/settings/units#bar-plates", title: "Plates", detail: "Used for the plate breakdown and warm-ups", keywords: "barbell plate calculator" },

  { page: "Places", href: "/settings/places", title: "Your places", detail: "The machines, plates and dumbbells where you train", keywords: "gym home equipment machines dumbbells" },
  { page: "Music", href: "/settings/music", title: "Music", detail: "Spotify, YouTube Music and workout playlists", keywords: "spotify youtube playlist" },
  { page: "Sounds", href: "/settings/sounds", title: "Sounds", detail: "Rest over, countdowns, PRs and vibration", keywords: "volume vibration haptics beep" },

  { page: "Notifications", href: "/settings/notifications", title: "Notifications", detail: "What reaches your phone, and when", keywords: "push alerts" },
  { page: "Notifications", href: "/settings/notifications#pause", title: "Pause all", detail: "No pushes from people for a while", keywords: "mute snooze" },
  { page: "Notifications", href: "/settings/notifications/quiet", title: "Quiet mode", detail: "No pushes from people at night", keywords: "sleep night do not disturb schedule" },
  { page: "Notifications", href: "/settings/notifications/likes", title: "Likes and comments", detail: "From everyone, people you follow, or off", keywords: "social push" },
  { page: "Notifications", href: "/settings/notifications#training", title: "Workout reminders and rest alerts", detail: "Your own training notifications", keywords: "reminder rest timer" },

  { page: "Appearance", href: "/settings/appearance#theme", title: "Theme", detail: "System, light or dark", keywords: "dark mode light mode colour color" },
  { page: "Appearance", href: "/settings/navbar", title: "Customise navigation", detail: "The tabs in the bottom bar", keywords: "bottom bar tabs nav" },

  { page: "Insights", href: "/settings/insights#muscle-groups", title: "Muscle groups", detail: "Learns your volume sweet spot per muscle", keywords: "volume frequency" },
  { page: "Insights", href: "/settings/insights#analytics", title: "Analytics", detail: "How progress charts are worked out", keywords: "charts 1rm e1rm" },

  { page: "Plugins", href: "/settings/plugins", title: "Plugins", detail: "Community widgets and algorithms", keywords: "community extensions" },

  { page: "Backup & import", href: "/settings/data#export", title: "Download a backup", detail: "Everything in one file", keywords: "export save" },
  { page: "Backup & import", href: "/settings/data#restore", title: "Restore a backup", detail: "From a LogIt backup file", keywords: "import file" },
  { page: "Backup & import", href: "/settings/import", title: "Import workouts", detail: "From Strong, Hevy or a spreadsheet", keywords: "strong hevy csv spreadsheet" },
  { page: "Backup & import", href: "/settings/data#delete", title: "Delete everything on this phone", detail: "When there's no account", keywords: "reset wipe erase" },

  { page: "Walkthroughs", href: "/settings/walkthroughs", title: "Walkthroughs", detail: "Replay a tour of any part of the app", keywords: "tour help guide tutorial" },
  { page: "About", href: "/settings/about", title: "Privacy and terms", detail: "LogIt is open source", keywords: "privacy policy terms licence" },
  { page: "About", href: "/settings/diagnostics", title: "Diagnostics", detail: "Send a report when something goes wrong", keywords: "logs bug report debug" },
];

/** Entries whose words start with every word of the query, best (title) matches first. */
export function searchSettings(query: string, entries: SettingsEntry[] = SETTINGS_ENTRIES): SettingsEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (e: SettingsEntry) => {
    const title = e.title.toLowerCase();
    const all = `${title} ${e.detail} ${e.page} ${e.keywords ?? ""}`.toLowerCase();
    const starts = (text: string, w: string) => text.split(/[^a-z0-9]+/).some((t) => t.startsWith(w));
    if (!words.every((w) => starts(all, w))) return 0;
    return words.every((w) => starts(title, w)) ? 2 : 1;
  };
  return entries
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}

/** Old one-page anchors (`/settings#sec-progression`) and where they live now. */
const LEGACY_SECTIONS: Record<string, string> = {
  "sec-account": "/settings/account",
  "sec-appearance": "/settings/appearance",
  "sec-units": "/settings/units",
  "sec-progression": "/settings/progression",
  "sec-mobility-progression": "/settings/mobility",
  "sec-muscle-group-insight": "/settings/insights",
  "sec-session": "/settings/workout",
  "sec-plugins": "/settings/plugins",
  "sec-data": "/settings/data",
};

export function legacySettingsHref(hash: string, search = ""): string | null {
  const to = LEGACY_SECTIONS[hash.replace(/^#/, "")];
  if (!to) return null;
  const [path, anchor] = to.split("#");
  return `${path}${search}${anchor ? `#${anchor}` : ""}`;
}
