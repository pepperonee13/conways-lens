import { reactive, computed } from 'vue';
import { filterSignificantContributions } from '../domain/violations.js';
import { formatTooltipDetail } from './tooltipFormatters.js';

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
    sources: null,
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

  const tooltipDetail = computed(() =>
    formatTooltipDetail(
      tooltip,
      id => effectiveTeams.value.find(t => t.id === id)?.name,
    )
  );

  const tooltipContributions = computed(() => {
    if (tooltip.type !== 'context') return [];
    const total = tooltip.commits || 0;
    const enriched = (tooltip.contributions ?? []).map(c => ({
      ...c,
      teamName: effectiveTeams.value.find(t => t.id === c.teamId)?.name ?? c.teamId,
      pct: ((c.commits / total) * 100).toFixed(1).replace(/\.0$/, ''),
    }));
    return filterSignificantContributions(enriched, tooltip.owningTeamId, total, violationThreshold.value);
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
