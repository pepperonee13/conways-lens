/**
 * Pure helpers for bounded-context source management.
 * Kept framework-free so they can be unit tested without a Vue/Pinia environment.
 *
 * A source is one of:
 *   { type: 'repo', repo: string }
 *   { type: 'path', repo: string, path: string }
 *   { type: 'glob', repo: string, pattern: string }
 */

export function sameSource(a, b) {
  return a.type === b.type && a.repo === b.repo &&
    (a.path    ?? null) === (b.path    ?? null) &&
    (a.pattern ?? null) === (b.pattern ?? null);
}

/**
 * Returns the first context in `contexts` that already owns `source`,
 * or null if the source is unclaimed.
 *
 * @param {object}   source   - the source to look up
 * @param {object[]} contexts - array of { id, name, sources[] }
 */
export function contextForSource(source, contexts) {
  return contexts.find(c => (c.sources ?? []).some(s => sameSource(s, source))) ?? null;
}
