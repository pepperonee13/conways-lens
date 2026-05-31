/**
 * Domain rules for cross-team contribution violations.
 *
 * A violation occurs when a team that does not own a context contributes
 * more than a configurable percentage of its total commits.
 */

/**
 * Returns true when `externalCommits` out of `totalCommits` meets or exceeds
 * `threshold` percent.
 */
export function exceedsThreshold(externalCommits, totalCommits, threshold) {
  if (totalCommits === 0 || externalCommits === 0) return false;
  return (externalCommits / totalCommits) * 100 >= threshold;
}

/**
 * Returns true when a context node has at least one external-team contribution
 * that exceeds the threshold.
 *
 * Expected shape of `context`:
 *   { commits: number, owningTeamId: string|null,
 *     contributions: Array<{ teamId: string, commits: number }> }
 */
export function isContextViolating(context, threshold) {
  if (!context.commits) return false;
  return (context.contributions ?? []).some(c =>
    c.teamId !== context.owningTeamId &&
    exceedsThreshold(c.commits, context.commits, threshold)
  );
}

/**
 * Filters a contributions array to those worth displaying: the owning team is
 * always included; external teams only when their share meets the threshold.
 * Returns a new array sorted owner-first, then by commit volume descending.
 *
 * Contributions may carry any extra fields (teamColor, teamName, …); they are
 * passed through unchanged so callers can enrich before or after.
 *
 * Expected shape of each item: { teamId: string, commits: number, [rest]: any }
 */
export function filterSignificantContributions(contributions, owningTeamId, total, threshold) {
  if (!total || !contributions?.length) return [];
  return contributions
    .filter(c => c.teamId === owningTeamId || (c.commits / total) * 100 >= threshold)
    .slice()
    .sort((a, b) => {
      const aOwner = a.teamId === owningTeamId ? 1 : 0;
      const bOwner = b.teamId === owningTeamId ? 1 : 0;
      if (aOwner !== bOwner) return bOwner - aOwner;
      return b.commits - a.commits;
    });
}
