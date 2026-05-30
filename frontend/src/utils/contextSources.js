/**
 * Pure helpers for bounded-context source management.
 * Kept framework-free so they can be unit tested without a Vue/Pinia environment.
 *
 * A source is one of:
 *   { type: 'repo', repo: string }
 *   { type: 'path', repo: string, path: string }
 *   { type: 'glob', repo: string, pattern: string }
 */

// Supports: ** (any path segment), * (any chars except /), ? (one char except /)
const REGEX_SPECIAL = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
export function globToRegex(pattern) {
  let result = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (ch === '*') {
      result += '[^/]*';
      i++;
    } else if (ch === '?') {
      result += '[^/]';
      i++;
    } else if (REGEX_SPECIAL.has(ch)) {
      result += '\\' + ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }
  return new RegExp(`^${result}$`);
}

export function sameSource(a, b) {
  return a.type === b.type && a.repo === b.repo &&
    (a.path    ?? null) === (b.path    ?? null) &&
    (a.pattern ?? null) === (b.pattern ?? null);
}

/** Returns true when `source` covers `filePath`. */
export function matchesSource(source, filePath) {
  if (source.type === 'repo') return true;
  if (source.type === 'path') {
    return filePath === source.path || filePath.startsWith(source.path + '/');
  }
  if (source.type === 'glob') return globToRegex(source.pattern).test(filePath);
  return false;
}

/**
 * Returns true when sources `a` and `b` could match the same file.
 *
 * Resolution order (fast to slow):
 *  1. Different repos          → never overlaps, no data needed.
 *  2. Exact duplicate          → always overlaps, no data needed.
 *  3. Either is type 'repo'   → covers everything in the repo, no data needed.
 *  4. Both are type 'path'    → static prefix check, no data needed.
 *  5. Glob involved            → iterate actual file paths via getFilePaths(repo).
 *
 * @param {object}            a            - first source
 * @param {object}            b            - second source
 * @param {function(string):Iterable<string>} getFilePaths
 *   Called with a repo name; yields/returns the file paths that exist in that repo.
 *   Defaults to an empty iterable so callers that don't need glob detection can omit it.
 */
export function sourcesOverlap(a, b, getFilePaths = () => []) {
  if (a.repo !== b.repo) return false;
  if (sameSource(a, b)) return true;
  if (a.type === 'repo' || b.type === 'repo') return true;
  if (a.type === 'path' && b.type === 'path') {
    return a.path.startsWith(b.path + '/') || b.path.startsWith(a.path + '/');
  }
  for (const filePath of getFilePaths(a.repo)) {
    if (matchesSource(a, filePath) && matchesSource(b, filePath)) return true;
  }
  return false;
}

/**
 * Returns the first context in `contexts` whose sources overlap with `source`, or null.
 *
 * @param {object}   source       - the source to check
 * @param {object[]} contexts     - array of { id, name, sources[] }
 * @param {function(string):Iterable<string>} getFilePaths
 *   Injected file-path provider; the store passes a function over timelineData,
 *   tests pass a function over a fixed array.
 */
export function contextForSource(source, contexts, getFilePaths = () => []) {
  return contexts.find(c =>
    (c.sources ?? []).some(s => sourcesOverlap(source, s, getFilePaths))
  ) ?? null;
}
