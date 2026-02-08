export function getSessionDate(session: { startedAtMs: number }): Date {
  return new Date(session.startedAtMs);
}

export function getSessionDayKey(session: { startedAtMs: number }): string {
  // local day bucket, stable key
  const d = new Date(session.startedAtMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
