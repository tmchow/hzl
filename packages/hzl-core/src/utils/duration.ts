export function parseDurationToMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  const match = /^(\d+)([mhd])?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const suffix = match[2] ?? 'm';
  const multiplier = suffix === 'd' ? 24 * 60 : suffix === 'h' ? 60 : 1;
  return value * multiplier;
}

export function normalizeDurationLabel(raw: string): string | null {
  const trimmed = raw.trim();
  const match = /^(\d+)([mhd])?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return match[2] ? trimmed : `${match[1]}m`;
}
