export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.rep-total", family: "progression-algorithm", entryExport: "algorithm" };

// Rep total (seed plugin): a total to reach, say 50 pull-ups, in as few sets as it takes. When
// you get there within your set limit, the total goes up. Bodyweight: weight 0 is bodyweight.
export const algorithm = {
  id: "app.getlogit.rep-total",
  name: "Rep total",
  description: "Reach a total number of reps in as few sets as it takes; the total rises when you hit it.",
  defaultState: {},
  defaultPreferences: { total: 50, maxSets: 6, step: 5 },
  preferencesSchema: [
    { key: "total", label: "Starting total", type: "number", default: 50, min: 10, max: 300, step: 5 },
    { key: "maxSets", label: "Within this many sets", type: "number", default: 6, min: 2, max: 15, step: 1 },
    { key: "step", label: "Raise the total by", type: "number", default: 5, min: 1, max: 25, step: 1 },
  ],

  suggest(input) {
    const p = input.userPreferences ?? {};
    const state = { ...(input.state ?? {}) };
    let total = Number(state.total ?? p.total ?? 50);
    const maxSets = Number(p.maxSets ?? 6), step = Number(p.step ?? 5);
    const last = input.history?.[0];
    const sets = (last?.sets ?? []).filter((s) => s.setType !== "warmup" && s.reps > 0);
    const done = sets.reduce((n, s) => n + s.reps, 0);
    let hit = false;
    // First use: last time is where you start, not a session against this total.
    if (state.seenMs === undefined && last) state.seenMs = last.performedAtMs;
    if (last && last.performedAtMs > (state.seenMs ?? 0)) {
      state.seenMs = last.performedAtMs;
      if (done >= total && sets.length <= maxSets) { total += step; hit = true; }
    }
    state.total = total;
    // Open with your best set (one more if you can), then split what's left.
    const best = Math.max(1, ...sets.map((s) => s.reps));
    const first = Math.min(total, best + 1);
    const out = [{ reps: first, weight: 0 }];
    let left = total - first;
    while (left > 0 && out.length < 15) {
      const r = Math.min(left, Math.max(1, Math.round(best * 0.8)));
      out.push({ reps: r, weight: 0 });
      left -= r;
    }
    return {
      sets: out,
      nextState: state,
      bodyweightLoad: true,
      label: `${total} reps`,
      notes: hit ? `You hit ${total - step} in ${sets.length} sets: now ${total}.` : `${total} reps in as few sets as it takes${sets.length ? ` (last time ${done} in ${sets.length})` : ""}.`,
    };
  },
};
