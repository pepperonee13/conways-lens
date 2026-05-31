/**
 * Internal commit model:
 * {
 *   author:     string,
 *   repo:       string,
 *   repoUrl:    string | null,
 *   commitHash: string,
 *   date:       string | null,   // YYYY-MM-DD
 *   filePath:   string | null,
 * }
 */

function commitKey(c) {
  return `${c.repo}\x00${c.commitHash}\x00${c.filePath ?? ''}`;
}

/**
 * Merges `incoming` commits into `existing`, skipping duplicates.
 * Deduplication key: repo + commitHash + filePath.
 */
export function mergeCommits(existing, incoming) {
  const seen = new Set(existing.map(commitKey));
  const result = [...existing];
  for (const c of incoming) {
    const k = commitKey(c);
    if (!seen.has(k)) { seen.add(k); result.push(c); }
  }
  return result;
}

/**
 * Merges an array of date ranges into the widest possible window.
 * Each range is { since?: string, until?: string } | null.
 * Returns null when no range has any bound.
 */
export function mergeDateRanges(ranges) {
  let since = null, until = null;
  for (const r of ranges) {
    if (r?.since && (!since || r.since < since)) since = r.since;
    if (r?.until && (!until || r.until > until)) until = r.until;
  }
  return since || until ? { since, until } : null;
}
