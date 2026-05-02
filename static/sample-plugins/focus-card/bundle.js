export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.focus-card",
  family: "widget",
  entryExport: "widget",
};

const TIPS = [
  {
    label: "Rest day",
    body: "Active recovery beats passive rest. A short walk keeps blood flowing without adding training stress.",
  },
  {
    label: "Start heavy",
    body: "Hit compound lifts first when your CNS is freshest. Accessories can wait.",
  },
  {
    label: "Bar path",
    body: "A straight bar path is more efficient than a pretty one. Move the weight from A to B.",
  },
  {
    label: "Log everything",
    body: "Warmup sets are data. Tracking them reveals how ready your body is on any given day.",
  },
  {
    label: "One more rep",
    body: "You don't need to add weight every session. Adding one rep to a single set still counts as progress.",
  },
  {
    label: "Show up",
    body: "Showing up at 80% three times a week beats a single 100% session followed by a week off.",
  },
  {
    label: "Rest between sets",
    body: "Compound lifts need 3-5 minutes of rest. Rushing it is one of the most common ways to stall.",
  },
];

export const widget = {
  renderHtml() {
    const today = TIPS[new Date().getDay()];
    return [
      `<p style="font-size:0.65rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-foreground)">Tip of the day</p>`,
      `<p style="margin-top:0.375rem;font-size:0.875rem;font-weight:600;color:var(--foreground)">${today.label}</p>`,
      `<p style="margin-top:0.25rem;font-size:0.8125rem;line-height:1.5;color:var(--muted-foreground)">${today.body}</p>`,
      `<p style="margin-top:0.75rem;font-size:0.65rem;color:var(--muted-foreground);opacity:0.5">Community plugin · focus-card</p>`,
    ].join("\n");
  },
};
