// The one list of what LogIt can do. Walkthroughs (web), short tours (phone), the user docs
// (getlogit.app/docs) and every "what each plan includes" list read from here, and
// consistency.test.ts fails when this list and the apps or the server disagree. See
// docs/walkthroughs-and-docs.md for how to add, change or remove a feature.

export type Plan = "Free" | "Pro" | "Studio";
export const PLANS: Plan[] = ["Free", "Pro", "Studio"];
export const planRank = (p: Plan) => PLANS.indexOf(p);

export type DocsSection =
  | "Start here"
  | "Training"
  | "Body"
  | "More"
  | "Pro"
  | "Coaching"
  | "Having a coach";

export type Feature = {
  /** Stable id, e.g. "coach-checkins". Steps, plan rows and docs pages refer to it. */
  id: string;
  title: string;
  section: DocsSection;
  /** The lowest plan that can use it at all. The web dashboard as a whole needs Pro. */
  plan: Plan;
  /** True when a Free account gets it while coached by a Studio coach (the server's orActivelyCoached locks). */
  freeWhenCoached?: boolean;
  /** True when a Free account can try it with sample clients before paying (the server's orSampleCoach locks). */
  freeWithSamples?: boolean;
  /** One sentence, shown on docs pages and in the plan table's tooltip. */
  summary: string;
  /** SvelteKit route ids (folder paths under src/routes) where it lives. */
  web?: string[];
  phone?: string[];
  /** Where to find it, in words: "Coaching › Check-ins". */
  whereWeb?: string;
  wherePhone?: string;
  /** The docs page, optionally with #section. */
  docs: string;
  /** Server routes behind a plan lock that belong to it (docs/generated/tier-gates.json). */
  server?: string[];
  can?: string[];
  cant?: string[];
  /** A row in "What each plan can do". */
  table?: string;
};

/** "look": read it and press Next. "do": no Next; it waits until the app reports `signal`. */
export type StepKind = "look" | "do";

export type Step = {
  id: string;
  /** Which app shows it. A docs how-to lists the web steps, in order. */
  on: "web" | "phone";
  /** The page the step is on (a route id). The guide opens it first if you're elsewhere. */
  route: string;
  /** A `data-guide="…"` mark in that app. Omit for a step that floats in the middle. */
  target?: string;
  title: string;
  body: string;
  kind: StepKind;
  /** For "do" steps: the name the app passes to guideSignal() when you've done it. */
  signal?: string;
  /** For a step whose target appears later (a sample client's request, a check-in arriving):
   * shown while waiting for it, instead of "not showing right now". */
  arrives?: string;
  /** Shown instead of `body` when the page has nothing to show yet (no synced data). */
  empty?: string;
  /** Leave this step out of the docs how-to (e.g. "here's the sidebar"). */
  notInDocs?: boolean;
};

export type Walkthrough = "pro" | "studio" | "app";

export type Chapter = {
  /** "studio.checkins" */
  id: string;
  walkthrough: Walkthrough;
  title: string;
  /** What you'll do, one line. */
  blurb: string;
  minutes: number;
  feature: string;
  /** Needs the sandbox's sample clients for its "do" steps. Without them those steps become "look". */
  usesSamples?: boolean;
  steps: Step[];
};
