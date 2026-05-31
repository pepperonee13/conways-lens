import Papa from 'papaparse';

/**
 * Parses a CSV string produced by extract-git-history into internal commit objects.
 * Handles the optional `Since=...,Until=...` metadata footer.
 *
 * This is the only place in the codebase that knows the raw CSV column names:
 *   Author     → author
 *   RepoName   → repo
 *   RepoUrl    → repoUrl
 *   CommitHash → commitHash
 *   Date       → date
 *   FilePath   → filePath
 *
 * Rows missing Author, RepoName, or CommitHash are dropped here so the rest of
 * the app works with a clean dataset.
 *
 * @param   {string} text - raw CSV text
 * @returns {{ commits: Commit[], dateRange: { since: string|null, until: string|null }|null }}
 */
export function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  let dateRange = null;
  if (lines.at(-1)?.startsWith('Since=')) {
    const m = lines.pop().match(/Since=([\d-]+)?(?:,Until=([\d-]+))?/);
    if (m) dateRange = { since: m[1] ?? null, until: m[2] ?? null };
  }
  const { data } = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true });
  const commits = data
    .filter(r => r.Author && r.RepoName && r.CommitHash)
    .map(r => ({
      author:     r.Author,
      repo:       r.RepoName,
      repoUrl:    r.RepoUrl   ?? null,
      commitHash: r.CommitHash,
      date:       r.Date      ?? null,
      filePath:   r.FilePath  ?? null,
    }));
  return { commits, dateRange };
}
