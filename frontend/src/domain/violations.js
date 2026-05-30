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
