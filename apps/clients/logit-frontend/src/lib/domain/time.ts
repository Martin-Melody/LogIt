export function nowMs(): number {
  return Date.now();
}

export function durationMs(startAtMs: number, endedAt: number): number {
  return Math.max(0, endedAt - startAtMs);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
