export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.protein-days", family: "widget", entryExport: "widget" };

// Protein days (seed widget): how many days each week reached the protein target, the last four
// weeks. Only days with food logged count. On a client's page it's theirs, when they share food.
const DAY = 86400000;

export const widget = {
  id: "app.getlogit.protein-days",
  name: "Protein days",
  description: "Days within the protein target, week by week.",
  needs: ["nutritionDays"],

  compute(input) {
    const nd = input.nutritionDays;
    const target = nd?.targetProteinG;
    if (!nd || !nd.days.length) return { title: "Protein days", body: [], empty: { text: "No food logged in the last four weeks." } };
    if (!target) return { title: "Protein days", body: [], empty: { text: "Set a protein target to see this." } };
    // Four weeks back from today, newest last; a day counts when protein reaches 95% of the target.
    const bars = [];
    for (let w = 3; w >= 0; w--) {
      const end = input.now - w * 7 * DAY, start = end - 7 * DAY;
      const days = nd.days.filter((d) => { const t = Date.parse(d.dateIso + "T12:00:00Z"); return t > start && t <= end; });
      const hit = days.filter((d) => d.proteinG >= target * 0.95).length;
      bars.push({ label: w === 0 ? "This week" : w === 1 ? "Last week" : w + " weeks ago", value: hit, max: 7, sublabel: hit + " of " + days.length + " logged days", tone: "protein" });
    }
    return { title: "Protein days", subtitle: "Target " + target + " g", body: [{ kind: "bar", bars }] };
  },
};
