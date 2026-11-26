// Card titles for the web app; which cards show lives in core (shared with the app and getlogit.app).
import type { CardKind } from "@logit/core/domain/profileCards";
export { CARD_BY_ID, cardHasData, orderedWidgets, parseProfileData, shownCards, type CardKind } from "@logit/core/domain/profileCards";

export const CARD_TITLE: Record<CardKind, string> = {
  body: "Body stats",
  split: "Current split",
  prs: "Personal records",
  photo: "Progress photo",
  weight: "Weight trend",
  streak: "Training streak",
  badges: "Milestones",
};
