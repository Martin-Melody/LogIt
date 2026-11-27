export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.roster-adherence", family: "card-pack", entryExport: "cards" };

// Roster adherence (seed card pack): every client's sessions against what their program plans
// this week, and whether their check-in is on time, as one list, the furthest behind first.
export const cards = {
  id: "app.getlogit.roster-adherence",
  name: "Roster adherence",
  cards: [{ id: "adherence", name: "Sessions and check-ins" }],

  compute(input) {
    const rows = input.clients.map((c) => {
      const ratio = c.plannedPerWeek ? Math.min(1, (c.sessions7d ?? 0) / c.plannedPerWeek) : null;
      const sessions = c.sessions7d === null ? "doesn't share workouts" : c.plannedPerWeek ? c.sessions7d + " of " + c.plannedPerWeek + " sessions" : c.sessions7d + " sessions";
      const checkin = c.checkinLateDays === null ? "" : c.checkinLateDays > 0 ? "check-in " + c.checkinLateDays + (c.checkinLateDays === 1 ? " day" : " days") + " late" : "check-ins on time";
      return { c, ratio, late: c.checkinLateDays ?? 0, line: [sessions, checkin].filter(Boolean).join(" · ") };
    });
    if (!rows.length) return { title: "Sessions and check-ins", body: [], empty: { text: "No clients yet." } };
    rows.sort((a, b) => (a.ratio ?? 2) - (b.ratio ?? 2) || b.late - a.late);
    const planned = rows.filter((r) => r.ratio !== null);
    const onPlan = planned.filter((r) => r.ratio >= 1).length;
    return {
      title: "Sessions and check-ins",
      subtitle: planned.length ? onPlan + " of " + planned.length + " on plan this week" : "Last 7 days",
      body: [{ kind: "list", items: rows.slice(0, 12).map((r) => ({ label: r.c.firstName, sublabel: r.line, trailing: r.ratio === null ? "" : Math.round(r.ratio * 100) + "%" })) }],
    };
  },
};
