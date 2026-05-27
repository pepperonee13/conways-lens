import * as d3 from 'd3';
import { TOOLTIP_OFFSET } from './graphConstants.js';

/**
 * Hierarchical bubble chart renderer — Circle Pack Layout.
 *
 * Teams are large circles; the repos they own are smaller circles packed
 * inside. Bubble area encodes commit volume. An orange dashed ring marks
 * repos with cross-team contributions above the violation threshold.
 *
 * Designed to give an at-a-glance view of team size and overlap that's
 * harder to read in the swimlane when there are many teams.
 */
export function useCirclePackGraph({
  svgRef,
  effectiveTeams,
  onShowNodeTooltip,
  onMoveTooltip,
  onHideTooltip,
  onNodeClick,
  violationThreshold,
  violatingOnly,
}) {

  function draw({ dims, data }) {
    if (!svgRef.value) return;

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();

    const { w, h } = dims;
    const threshold      = violationThreshold?.value ?? 5;
    const filterViolating = violatingOnly?.value ?? false;
    const teams          = effectiveTeams.value;

    const teamNodeMap = Object.fromEntries(
      data.nodes.filter(n => n.type === 'team').map(n => [n.id, n])
    );

    // Build hierarchy: root → teams → repos
    const children = [];
    for (const team of teams) {
      const teamNode  = teamNodeMap[`team:${team.id}`];
      const teamRepos = data.nodes.filter(n => n.type === 'repo' && n.owningTeamId === team.id);

      const filteredRepos = filterViolating
        ? teamRepos.filter(r => r.contributions?.some(c =>
            c.teamId !== r.owningTeamId && r.commits > 0 &&
            (c.commits / r.commits) * 100 >= threshold
          ))
        : teamRepos;

      if (filteredRepos.length === 0 && filterViolating) continue;

      children.push({
        id:          `team:${team.id}`,
        name:        team.name,
        color:       team.color,
        teamId:      team.id,
        type:        'team',
        commits:     teamNode?.commits     ?? 0,
        repoCount:   teamNode?.repoCount   ?? 0,
        authorCount: teamNode?.authorCount ?? 0,
        children: filteredRepos.length > 0
          ? filteredRepos.map(r => ({
              id:                 r.id,
              name:               r.id,
              type:               'repo',
              value:              Math.max(1, r.commits),
              commits:            r.commits,
              owningTeamId:       r.owningTeamId,
              contributions:      r.contributions      ?? [],
              authorContributions: r.authorContributions ?? null,
              teamColor:          team.color,
            }))
          : [{ id: `${team.id}:placeholder`, name: '', type: 'empty', value: 10 }],
      });
    }

    if (children.length === 0) return;

    const root = d3.hierarchy({ id: 'root', children })
      .sum(d => d.value ?? 0)
      .sort((a, b) => b.value - a.value);

    d3.pack()
      .size([w - 8, h - 8])
      .padding(d => d.depth === 0 ? 18 : 5)(root);

    svg.attr('width', w).attr('height', h);

    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    const g = svg.append('g').attr('transform', 'translate(4,4)');

    // ── Team circles ────────────────────────────────────────────────────────
    const teamGs = g.selectAll('g.team-bubble')
      .data(root.children ?? [])
      .join('g')
      .attr('class', 'team-bubble')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    teamGs.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', 0.13)
      .attr('stroke', d => d.data.color)
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.5);

    teamGs.append('text')
      .attr('y', d => -(d.r - 14))
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', d => Math.min(13, Math.max(9, d.r * 0.12)) + 'px')
      .attr('font-weight', '600')
      .attr('fill', '#374151')
      .attr('pointer-events', 'none')
      .text(d => d.data.name);

    teamGs
      .on('mouseover', (event, d) => {
        const nd = d.data;
        onShowNodeTooltip({
          id: nd.id, type: 'team', name: nd.name,
          commits: nd.commits, repoCount: nd.repoCount, authorCount: nd.authorCount,
        }, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.pageX + TOOLTIP_OFFSET.x, e.pageY + TOOLTIP_OFFSET.y))
      .on('mouseout', () => onHideTooltip());

    // ── Repo circles ─────────────────────────────────────────────────────────
    const repoNodes = root.descendants().filter(d => d.depth === 2 && d.data.type === 'repo');

    const repoGs = g.selectAll('g.repo-bubble')
      .data(repoNodes)
      .join('g')
      .attr('class', 'repo-bubble')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    repoGs.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.data.teamColor)
      .attr('fill-opacity', 0.78)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer');

    // Violation ring — orange dashed outline when cross-team commits exceed threshold
    repoGs.each(function(d) {
      const hasViolation = d.data.contributions?.some(c =>
        c.teamId !== d.data.owningTeamId && d.data.commits > 0 &&
        (c.commits / d.data.commits) * 100 >= threshold
      );
      if (hasViolation) {
        d3.select(this).append('circle')
          .attr('r', d.r + 3.5)
          .attr('fill', 'none')
          .attr('stroke', '#F08223')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,3')
          .attr('opacity', 0.9)
          .attr('pointer-events', 'none');
      }
    });

    repoGs.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', d => Math.min(11, Math.max(7, d.r * 0.33)) + 'px')
      .attr('font-weight', '600')
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => {
        const name     = d.data.name;
        const maxChars = Math.max(1, Math.floor(d.r * 1.5 / 6));
        return name.length > maxChars ? name.slice(0, maxChars) + '…' : name;
      });

    repoGs
      .on('mouseover', (event, d) => {
        onShowNodeTooltip(d.data, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.pageX + TOOLTIP_OFFSET.x, e.pageY + TOOLTIP_OFFSET.y))
      .on('mouseout', () => onHideTooltip())
      .on('click', (event, d) => { event.stopPropagation(); onNodeClick(d.data.id); });
  }

  function updateEdgeStyles() {}
  function updateNodeColors() {}
  function drawOverlays() {}

  function teardown() {
    if (svgRef.value) d3.select(svgRef.value).selectAll('*').remove();
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
