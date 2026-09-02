import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function duration(startMs: number, endMs: number): string {
  const min = Math.round((endMs - startMs) / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export const recentSessionsWidget: WidgetPlugin = {
  id: "last-session",
  name: "Recent Sessions",
  description: "Jump back into a recent session.",
  needs: ["workouts"],

  compute(input: WidgetInput): WidgetView {
    const sessions = [...(input.workouts ?? [])]
      .filter((w) => w.endedAtMs)
      .sort((a, b) => (b.endedAtMs ?? 0) - (a.endedAtMs ?? 0))
      .slice(0, 4);

    if (sessions.length === 0) {
      return {
        title: "Recent Sessions",
        body: [],
        empty: { text: "No sessions yet — log your first workout.", action: { startEmptyWorkout: true } },
      };
    }

    return {
      title: "Recent Sessions",
      body: [
        {
          kind: "list",
          items: sessions.map((s) => {
            let topSet: string | undefined;
            let best: { name: string; weight: number; reps: number } | null = null;
            for (const ex of s.exercises) {
              for (const set of ex.sets) {
                if (
                  !best ||
                  set.weight > best.weight ||
                  (set.weight === best.weight && set.reps > best.reps)
                ) {
                  best = { name: ex.name, weight: set.weight, reps: set.reps };
                }
              }
            }
            if (best) topSet = `${best.name} ${best.reps}×${best.weight}`;
            return {
              label: dateLabel(s.endedAtMs ?? s.startedAtMs),
              sublabel: topSet
                ? `Top: ${topSet}`
                : `${s.exercises.length} exercise${s.exercises.length === 1 ? "" : "s"}`,
              trailing: s.endedAtMs ? duration(s.startedAtMs, s.endedAtMs) : "in progress",
              action: { navigate: `/sessions/${s.id}` },
            };
          }),
        },
      ],
      action: { navigate: "/sessions" },
    };
  },
};
