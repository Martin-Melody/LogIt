export const pluginBundle = {
  formatVersion: 1,
  pluginId: "sample.widget.focus-card",
  family: "widget",
  entryExport: "widget",
};

export const widget = {
  renderHtml() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const date = now.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    return `
      <div class="rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-sm">
        <p class="text-xs font-medium uppercase tracking-[0.2em] text-primary/70">Sample widget</p>
        <h2 class="mt-2 text-base font-semibold">Focus Card</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          This is a sample widget bundle loaded through the plugin runtime host.
        </p>
        <div class="mt-3 rounded-xl border border-border bg-background px-3 py-2">
          <p class="text-sm font-medium">Current time</p>
          <p class="text-sm text-muted-foreground">${date} at ${time}</p>
        </div>
      </div>
    `;
  },
};
