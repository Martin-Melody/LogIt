const TAGLINES = [
  "Remember: perfect form beats perfect numbers.",
  "Small wins stack up.",
  "Today’s workout is tomorrow’s confidence.",
  "Leave it better than you found it.",
  "Consistency > intensity.",
  "One more set. One more rep.",
  "You showed up. That counts.",
  "Strength is built, not found.",
  "Progress, not perfection.",
];

export function getRandomTagline(): string {
  const idx = Math.floor(Math.random() * TAGLINES.length);
  return TAGLINES[idx] ?? "Let’s train.";
}
