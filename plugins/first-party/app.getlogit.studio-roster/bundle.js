export const pluginBundle = { formatVersion: 1, pluginId: "app.getlogit.studio-roster", family: "card-pack", entryExport: "cards" };

// Studio roster (seed card pack): months with you, programs ending soon, who's new this month.
// Given only roster facts (no payments, messages, food, weight or photos).
export const cards = {
  id: "app.getlogit.studio-roster",
  name: "Studio roster",
  cards: [
    { id: "roster", name: "Months with you" },
    { id: "ending", name: "Programs ending soon" },
    { id: "new", name: "New this month" },
  ],

  compute(input) {
    const clients = input.clients;
    if (input.card === "ending") {
      const soon = clients.filter((c) => c.program && c.program.endsInDays !== null && c.program.endsInDays <= 14).sort((a, b) => a.program.endsInDays - b.program.endsInDays);
      if (!soon.length) return { title: "Programs ending soon", body: [], empty: { text: "Nothing ends in the next two weeks." } };
      return { title: "Programs ending soon", body: [{ kind: "list", items: soon.map((c) => ({ label: c.firstName, sublabel: c.program.name, trailing: c.program.endsInDays === 0 ? "today" : "in " + c.program.endsInDays + (c.program.endsInDays === 1 ? " day" : " days") })) }] };
    }
    if (input.card === "new") {
      const fresh = clients.filter((c) => c.joinedThisMonth);
      if (!fresh.length) return { title: "New this month", body: [], empty: { text: "Nobody new yet this month." } };
      return { title: "New this month", subtitle: fresh.length + (fresh.length === 1 ? " client" : " clients"), body: [{ kind: "list", items: fresh.map((c) => ({ label: c.firstName, trailing: c.program ? c.program.name : "no program yet" })) }] };
    }
    if (!clients.length) return { title: "Months with you", body: [], empty: { text: "No clients yet." } };
    const sorted = [...clients].sort((a, b) => b.monthsWithYou - a.monthsWithYou);
    const avg = Math.round(clients.reduce((n, c) => n + c.monthsWithYou, 0) / clients.length);
    return {
      title: "Months with you",
      subtitle: "On average " + avg + (avg === 1 ? " month" : " months"),
      body: [{ kind: "list", items: sorted.slice(0, 8).map((c) => ({ label: c.firstName, trailing: c.monthsWithYou + (c.monthsWithYou === 1 ? " month" : " months") })) }],
    };
  },
};
