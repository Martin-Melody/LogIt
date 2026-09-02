export const pluginBundle = {
  formatVersion: 1,
  pluginId: "sample.widget.week-recap",
  family: "widget",
  entryExport: "widget",
};

export const widget = {
  id: "sample.widget.week-recap",
  name: "Week Recap",
  description: "Sets, tonnage and sessions logged in the last 7 days.",
  needs: ["workouts"],
  compute(input) {
    const since = input.now - 7 * 24 * 60 * 60 * 1000;
    let sets = 0;
    let tonnage = 0;
    let sessions = 0;
    for (const w of input.workouts || []) {
      if (!w.endedAtMs || w.endedAtMs < since) continue;
      sessions += 1;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          sets += 1;
          tonnage += (Number(s.weight) || 0) * (Number(s.reps) || 0);
        }
      }
    }

    if (sessions === 0) {
      return {
        title: "Week Recap",
        body: [],
        empty: { text: "Nothing logged in the last 7 days.", action: { startEmptyWorkout: true } },
      };
    }

    const unit = input.prefs.weightUnit;
    const t = unit === "lbs" ? tonnage * 2.2046226 : tonnage;

    return {
      title: "Week Recap",
      subtitle: "Last 7 days",
      body: [
        {
          kind: "stat-grid",
          stats: [
            { label: "Sessions", value: String(sessions) },
            { label: "Sets", value: String(sets) },
            { label: "Volume", value: `${Math.round(t).toLocaleString()} ${unit}` },
          ],
        },
      ],
      action: { navigate: "/sessions" },
    };
  },
};
