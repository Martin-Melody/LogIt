// Which suggestion Home shows next (NextStepWidget, design canvas O7): one at a time, in
// order, each once it's earned and until it's done or dismissed.
import type { TrainingGoal } from "@logit/core/domain/starterPlan";

export type NextStep = { id: "food" | "name" | "friends" | "summary"; title: string; text: string; action: string; href: string };

const FOOD: Record<TrainingGoal | "default", { title: string; text: string }> = {
  muscle: { title: "Eating enough protein?", text: "Building muscle needs it. Track food in under a minute a day." },
  both: { title: "Eating enough protein?", text: "Getting bigger and stronger needs it. Track food in under a minute a day." },
  leaner: { title: "Lose fat, keep the strength", text: "Eat a little under and keep protein high. Track food in under a minute a day." },
  strength: { title: "Eating enough to recover?", text: "Heavier lifts need fuel. Track food in under a minute a day." },
  fit: { title: "Want to keep an eye on food?", text: "Track it in under a minute a day, or not at all. Up to you." },
  default: { title: "Eating enough protein?", text: "Track food in under a minute a day." },
};

export function pickNextStep(s: {
  workouts: number;
  hasFoodGoal: boolean;
  hasName: boolean;
  signedIn: boolean;
  firstWeekOver: boolean;
  goal: TrainingGoal | null;
  dismissed: string[];
}): NextStep | null {
  const open = (id: NextStep["id"]) => !s.dismissed.includes(id);
  if (s.workouts >= 2 && !s.hasFoodGoal && open("food")) {
    const f = FOOD[s.goal ?? "default"];
    return { id: "food", ...f, action: "Set up food tracking", href: "/nutrition/goal" };
  }
  if (s.workouts >= 3 && !s.hasName && open("name")) {
    return { id: "name", title: "Put your name on it", text: "A name and a photo, so friends know it's you.", action: "Add your name", href: "/profile" };
  }
  if (s.workouts >= 3 && open("friends")) {
    return s.signedIn
      ? { id: "friends", title: "Train with friends", text: "Follow friends to see their workouts and cheer them on.", action: "Find friends", href: "/social" }
      : { id: "friends", title: "Train with friends", text: "A free account lets you follow friends and cheer them on.", action: "Make a free account", href: "/auth?mode=register" };
  }
  if (s.firstWeekOver && open("summary")) {
    return { id: "summary", title: "Your first week in numbers", text: "See what moved: lifts, volume and your streak.", action: "See your week", href: "/progress" };
  }
  return null;
}
