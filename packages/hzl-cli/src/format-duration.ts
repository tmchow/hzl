export function formatDuration(ms: number): string {
  if (ms < 60_000) return 'just now';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatTimeAgo(isoTimestamp: string): string {
  return formatDuration(Date.now() - new Date(isoTimestamp).getTime());
}
