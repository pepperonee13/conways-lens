/**
 * Pure formatting helpers for graph tooltip text.
 * No Vue, no reactive state — plain inputs, plain string output.
 */

/**
 * Returns the detail line shown beneath a node's name in the tooltip.
 *
 * @param {{ type: string, commits: number, contextCount: number, authorCount: number,
 *           context: string, teamName: string, pct: number|null,
 *           owningTeamId: string|null }} node  - plain tooltip state object
 * @param {(id: string) => string|undefined} getTeamName  - looks up a team's display name
 * @returns {string}
 */
export function formatTooltipDetail(node, getTeamName) {
  const c = node.commits.toLocaleString();

  if (node.type === 'team') {
    const ctx  = node.contextCount === 1 ? 'context' : 'contexts';
    const devs = node.authorCount  === 1 ? 'dev'     : 'devs';
    return `Team · ${node.contextCount} ${ctx} · ${node.authorCount} ${devs} · ${c} commits`;
  }

  if (node.type === 'team-collapsed') {
    const devs        = node.authorCount;
    const devLabel    = devs === 1 ? 'dev' : 'devs';
    const commitLabel = node.context === 'folder' ? `${c} commits at this level` : `${c} commits`;
    return `${devs} ${devLabel} · ${commitLabel} · click to expand`;
  }

  if (node.type === 'folder') return `${c} commits`;

  if (node.type === 'context') {
    const owningTeamName = node.owningTeamId ? getTeamName(node.owningTeamId) : null;
    return owningTeamName ? `${c} commits · ${owningTeamName}` : `${c} commits`;
  }

  // author / link fallback
  const team   = node.teamName ? ` · ${node.teamName}` : '';
  const pctStr = node.pct != null
    ? (node.context === 'folder' ? `${node.pct}% of this level's commits` : `${node.pct}%`)
    : `${c} commits`;
  return `${pctStr}${team}`;
}
