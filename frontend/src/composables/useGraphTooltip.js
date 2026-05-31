import { reactive, computed } from 'vue';

const MAX_TOOLTIP_AUTHORS = 3;

export function useGraphTooltip({ effectiveTeams, allContexts, anonMap, violationThreshold }) {
  const tooltip = reactive({
    show: false, x: 0, y: 0, anchorRight: false,
    isLink: false,
    name: '', type: '', commits: 0, pct: null,
    teamName: '', contextCount: 0, authorCount: 0,
    source: '', target: '', action: '',
    contributions: [], owningTeamId: null,
    authorContributions: null,
    folderFullPath: null,
    folderLastCommit: null,
    context: '',
    contribsLabel: null,
    teamInboundBreakdown: null,
    teamOutboundBreakdown: null,
    repoBreakdown: null,
  });

  function teamNameById(id) {
    return effectiveTeams.value.find(t => t.id === id)?.name ?? id;
  }

  function teamColorById(id) {
    return effectiveTeams.value.find(t => t.id === id)?.color ?? '#9CA3AF';
  }

  function displayNodeName(id) {
    if (!id) return '';
    if (id.startsWith('team:')) {
      const teamId = id.slice(5);
      return effectiveTeams.value.find(t => t.id === teamId)?.name ?? id;
    }
    return allContexts.value.find(c => c.id === id)?.name ?? id;
  }

  const tooltipName = computed(() => {
    if (tooltip.type === 'team' || tooltip.type === 'team-collapsed') return tooltip.teamName;
    if (tooltip.type === 'author') return anonMap.value[tooltip.name] ?? tooltip.name;
    if (tooltip.type === 'context') return allContexts.value.find(c => c.id === tooltip.name)?.name ?? tooltip.name;
    return tooltip.name;
  });

  const tooltipDetail = computed(() => {
    const c = tooltip.commits.toLocaleString();
    if (tooltip.type === 'team')
      return `Team · ${tooltip.contextCount} ${tooltip.contextCount === 1 ? 'context' : 'contexts'} · ${tooltip.authorCount} ${tooltip.authorCount === 1 ? 'dev' : 'devs'} · ${c} commits`;
    if (tooltip.type === 'team-collapsed') {
      const devs = tooltip.authorCount;
      const commitLabel = tooltip.context === 'folder' ? `${c} commits at this level` : `${c} commits`;
      return `${devs} ${devs === 1 ? 'dev' : 'devs'} · ${commitLabel} · click to expand`;
    }
    if (tooltip.type === 'folder')
      return `${c} commits`;
    if (tooltip.type === 'context') {
      const owningTeam = tooltip.owningTeamId
        ? effectiveTeams.value.find(t => t.id === tooltip.owningTeamId)?.name
        : null;
      return owningTeam ? `${c} commits · ${owningTeam}` : `${c} commits`;
    }
    const team   = tooltip.teamName ? ` · ${tooltip.teamName}` : '';
    const pctStr = tooltip.pct != null
      ? (tooltip.context === 'folder' ? `${tooltip.pct}% of this level's commits` : `${tooltip.pct}%`)
      : `${c} commits`;
    return `${pctStr}${team}`;
  });

  const tooltipContributions = computed(() => {
    if (tooltip.type !== 'context') return [];
    const total = tooltip.commits || 0;
    if (!total) return [];
    const threshold = violationThreshold.value;
    return tooltip.contributions
      .filter(c => c.teamId === tooltip.owningTeamId || (c.commits / total) * 100 >= threshold)
      .map(c => ({
        teamId:   c.teamId,
        teamColor: c.teamColor,
        teamName: effectiveTeams.value.find(t => t.id === c.teamId)?.name ?? c.teamId,
        commits:  c.commits,
        pct: ((c.commits / total) * 100).toFixed(1).replace(/\.0$/, ''),
      }))
      .sort((a, b) => {
        const aOwner = a.teamId === tooltip.owningTeamId ? 1 : 0;
        const bOwner = b.teamId === tooltip.owningTeamId ? 1 : 0;
        if (aOwner !== bOwner) return bOwner - aOwner;
        return b.commits - a.commits;
      });
  });

  const tooltipDisplayedAuthors = computed(() =>
    (tooltip.authorContributions ?? []).slice(0, MAX_TOOLTIP_AUTHORS)
  );

  const tooltipHiddenAuthorCount = computed(() =>
    Math.max(0, (tooltip.authorContributions?.length ?? 0) - MAX_TOOLTIP_AUTHORS)
  );

  return {
    tooltip,
    tooltipName,
    tooltipDetail,
    tooltipContributions,
    tooltipDisplayedAuthors,
    tooltipHiddenAuthorCount,
    teamNameById,
    teamColorById,
    displayNodeName,
  };
}
