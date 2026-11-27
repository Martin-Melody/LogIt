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
  askCode: string | null;
  askPays: boolean;
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
