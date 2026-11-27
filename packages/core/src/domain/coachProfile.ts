/** The Coaching section of a coach's profile (canvas P1, P3). */
export type CoachMode = "online" | "inperson" | "both";

export interface CoachProfile {
  headline: string;
  mode: CoachMode;
  place: string | null;
  /** Markdown, drawn with @logit/ui's RichText. */
  about: string;
  goodFor: string[];
}

export interface PublicPackage {
  name: string;
  description: string;
  amountCents: number;
  currency: string;
  interval: "month" | "once";
  weeks: number | null;
}

/** What someone else sees. `askCode` is the invite link the button opens (null: no live link);
 * `askPays`: that link takes payment and starts coaching straight away. */
export interface CoachingSection extends CoachProfile {
  packages: PublicPackage[];
  /** Older apps' button: a live invite link. The profile now asks by username (/coach/ask). */
  askCode: string | null;
  askPays: boolean;
  /** Canvas A4: the coach's client limit is reached (missing on older servers = not full). */
  full?: boolean;
  /** When full: "waitlist" asks onto the waiting list, "stop" turns the button off. */
  whenFull?: "waitlist" | "stop";
  expectSpots?: string | null;
  /** Canvas Z7: away until then (only when the coach tells people who ask). */
  awayUntil?: string | null;
}

/** "Away until 2 Jan" for people about to ask (canvas Z7), or null. */
export function awayLine(awayUntil: string | null | undefined, first: string, now = new Date()): string | null {
  if (!awayUntil) return null;
  const until = new Date(awayUntil);
  if (until <= now) return null;
  const day = until.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${first} is away until ${day}. You can still ask; ${first} replies when back.`;
}

/** What the profile's ask button says and whether it works (canvas P1, A4). */
export function askButton(section: Pick<CoachingSection, "full" | "whenFull" | "expectSpots">, first: string): {
  label: string;
  enabled: boolean;
  note: string;
  fullLine: string | null;
} {
  if (!section.full) return { label: "Ask to be coached", enabled: true, note: `${first} reads what you send and replies. You only pay if ${first} offers you a spot and you take it.`, fullLine: null };
  const fullLine = `Full right now.${section.expectSpots ? ` ${first} expects spots in ${section.expectSpots}.` : ""}`;
  return section.whenFull === "stop"
    ? { label: "Not taking new clients", enabled: false, note: `${first} isn't taking requests right now.`, fullLine }
    : { label: "Join the waiting list", enabled: true, note: `Joining asks the same questions. ${first} reads them when a spot opens.`, fullLine };
}

export interface ProfilePackage extends PublicPackage {
  id: string;
  showOnProfile: boolean;
}

/** The coach's own view: null profile before the first save; `public` once it shows to others. */
export interface MyCoachProfile {
  profile: CoachProfile | null;
  packages: ProfilePackage[];
  public: boolean;
}

export const COACH_LIMITS = { headline: 120, place: 80, about: 4000, goodFor: 6, tag: 24 } as const;

/** Suggested "Good fit for" tags; a coach can add their own. */
export const GOOD_FOR_SUGGESTIONS = [
  "Strength", "Hypertrophy", "Beginners", "Powerlifting", "Fat loss", "Mobility", "Older lifters", "Desk workers",
] as const;

/** "Online", "In person in Cork", "Online and in Cork". */
export function whereText(p: Pick<CoachProfile, "mode" | "place">): string {
  const place = p.place?.trim();
  if (p.mode === "online") return "Online";
  if (p.mode === "inperson") return place ? `In person in ${place}` : "In person";
  return place ? `Online and in ${place}` : "Online and in person";
}
