import * as d3 from 'd3';
import { TOOLTIP_OFFSET } from './graphConstants.js';

/**
 * Hierarchical bubble chart renderer — Circle Pack Layout.
 *
 * Teams are large circles; the repos they own are smaller circles packed
 * inside. Bubble area encodes commit volume. An orange dashed ring marks
 * repos with cross-team contributions above the violation threshold.
 *
 * On hover over any bubble, curved edges appear showing cross-team links:
 * - Team hover → all edges where this team contributed to another team's repos
 *   (outbound) plus all edges from other teams into this team's repos (inbound).
 * - Repo hover → all edges from contributing teams to this repo.
 * Edge color = contributing team's color.
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
    const threshold       = violationThreshold?.value ?? 5;
    const filterViolating = violatingOnly?.value ?? false;
    const teams           = effectiveTeams.value;

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
              id:                  r.id,
              name:                r.id,
              type:                'repo',
              value:               Math.max(1, r.commits),
              commits:             r.commits,
              owningTeamId:        r.owningTeamId,
              contributions:       r.contributions      ?? [],
              authorContributions: r.authorContributions ?? null,
              teamColor:           team.color,
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

    // ── Position map for edge drawing ────────────────────────────────────────
    // Keyed by node id → absolute {x, y, r, color}
    const posMap = {};
    for (const d of root.children ?? []) {
      posMap[d.data.id] = { x: d.x, y: d.y, r: d.r, color: d.data.color };
    }
    const allRepoPackNodes = root.descendants().filter(d => d.depth === 2);
    for (const d of allRepoPackNodes) {
      posMap[d.data.id] = { x: d.x, y: d.y, r: d.r, color: d.data.teamColor ?? d.parent?.data.color };
    }

    // Cross-team links only: contributing team ≠ owning team of target repo
    const repoOwnerMap = Object.fromEntries(
      data.nodes.filter(n => n.type === 'repo').map(n => [n.id, n.owningTeamId])
    );
    const teamColorMap = Object.fromEntries(
      teams.map(t => [`team:${t.id}`, t.color])
    );
    const crossLinks = data.links.filter(l =>
      repoOwnerMap[l.target] !== undefined &&
      l.source.replace('team:', '') !== repoOwnerMap[l.target]
    );

    // ── Edge layer (below everything) ────────────────────────────────────────
    const edgeLayer = g.append('g').attr('class', 'edge-layer');

    function clearEdges() {
      edgeLayer.selectAll('*').remove();
    }

    function drawEdges(links) {
      clearEdges();
      for (const l of links) {
        const src = posMap[l.source];
        const tgt = posMap[l.target];
        if (!src || !tgt) continue;

        // Offset control point perpendicular to the chord for a gentle curve
        const dx  = tgt.x - src.x;
        const dy  = tgt.y - src.y;
        const cpx = (src.x + tgt.x) / 2 - dy * 0.3;
        const cpy = (src.y + tgt.y) / 2 + dx * 0.3;

        edgeLayer.append('path')
          .attr('d', `M${src.x},${src.y} Q${cpx},${cpy} ${tgt.x},${tgt.y}`)
          .attr('fill', 'none')
          .attr('stroke', teamColorMap[l.source] ?? src.color)
          .attr('stroke-width', 2)
          .attr('stroke-opacity', 0.7)
          .attr('pointer-events', 'none');
      }
    }

    // Dismiss edges when cursor leaves the graph entirely
    g.on('mouseleave', clearEdges);

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
        event.stopPropagation();
        const teamNodeId = d.data.id;
        const teamId     = d.data.teamId;
        // Outbound: this team → repos in other teams
        // Inbound:  other teams → repos this team owns
        const links = crossLinks.filter(l =>
          l.source === teamNodeId || repoOwnerMap[l.target] === teamId
        );
        drawEdges(links);
        onShowNodeTooltip({
          id: teamNodeId, type: 'team', name: d.data.name,
          commits: d.data.commits, repoCount: d.data.repoCount, authorCount: d.data.authorCount,
        }, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.pageX + TOOLTIP_OFFSET.x, e.pageY + TOOLTIP_OFFSET.y))
      .on('mouseout', () => { clearEdges(); onHideTooltip(); });

    // ── Repo circles ─────────────────────────────────────────────────────────
    const repoNodes = allRepoPackNodes.filter(d => d.data.type === 'repo');

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
        event.stopPropagation();
        // Show all cross-team edges into this repo
        const links = crossLinks.filter(l => l.target === d.data.id);
        drawEdges(links);
        onShowNodeTooltip(d.data, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.pageX + TOOLTIP_OFFSET.x, e.pageY + TOOLTIP_OFFSET.y))
      .on('mouseout', () => { clearEdges(); onHideTooltip(); })
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
