// packages/hzl-cli/src/short-id.ts

const MIN_PREFIX_LEN = 8;

/**
 * Compute the minimum-unique prefix length for a set of IDs.
 * Returns a function that truncates any ID to its unique prefix.
 * Like `git log --abbrev-commit` — adapts to the dataset.
 */
export function createShortId(ids: string[]): (id: string) => string {
  if (ids.length <= 1) {
    return (id: string) => id.slice(0, MIN_PREFIX_LEN);
  }

  // Find the minimum prefix length where all IDs are unique
  const sorted = [...ids].sort();
  let maxCommon = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    let j = 0;
    while (j < sorted[i].length && sorted[i][j] === sorted[i + 1][j]) {
      j++;
    }
    if (j > maxCommon) maxCommon = j;
  }

  // Need one more char than the longest common prefix, with a floor
  const prefixLen = Math.max(MIN_PREFIX_LEN, maxCommon + 1);

  return (id: string) => id.slice(0, prefixLen);
}
