/**
 * Strip top-level empty arrays and empty objects from a record.
 * Keeps nulls, scalars, non-empty arrays, and non-empty objects.
 * Does not recurse — only strips at the top level.
 */
export function stripEmptyCollections<T extends object>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length === 0) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) continue;
    result[key] = value;
  }
  return result as Partial<T>;
}
