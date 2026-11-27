export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.climbing-week", family: "widget", entryExport: "widget" };

// Climbing this week (canvas W9): sessions with a Bouldering block, the hardest send and flash,
// and tries on projects. Reads only workouts; on a client's page it gets theirs, when they share.
const GRADE = (g) => (typeof g === "string" && /^V(\d+)$/.test(g) ? Number(g.slice(1)) : -1);

export const widget = {
  id: "app.getlogit.climbing-week",
  name: "Climbing this week",
  description: "Sessions, hardest send and flash, and tries on projects, from Bouldering blocks.",
  needs: ["workouts"],

  compute(input) {
    const since = input.now - 7 * 24 * 60 * 60 * 1000;
    let sessions = 0, hardest = -1, flash = -1, projectTries = 0, problems = 0;
    for (const w of input.workouts ?? []) {
      if ((w.endedAtMs ?? w.startedAtMs) < since) continue;
      const blocks = (w.blocks ?? []).filter((b) => b.pluginId === "app.getlogit.boulder");
      if (!blocks.length) continue;
      sessions++;
      for (const b of blocks) {
        for (const e of b.entries) {
          problems++;
          const g = GRADE(e.grade);
          if (e.result === "Sent" || e.result === "Flash") hardest = Math.max(hardest, g);
          if (e.result === "Flash") flash = Math.max(flash, g);
          if (e.result === "Project") projectTries += Number(e.tries) || 0;
        }
      }
    }
    if (sessions === 0) {
      return { title: "Climbing this week", body: [], empty: { text: "No Bouldering blocks in the last 7 days." } };
    }
    const stats = [
      { label: "Sessions", value: String(sessions), sublabel: problems + " problems" },
      { label: "Hardest send", value: hardest >= 0 ? "V" + hardest : "None yet", sublabel: flash >= 0 ? "flash V" + flash : undefined },
    ];
    if (projectTries) stats.push({ label: "Tries on projects", value: String(projectTries) });
    return { title: "Climbing this week", subtitle: "Last 7 days", body: [{ kind: "stat-grid", stats }] };
  },
};
