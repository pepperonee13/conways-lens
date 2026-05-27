import * as d3 from 'd3';
import { TOOLTIP_OFFSET } from './graphConstants.js';

/**
 * Hierarchical bubble chart renderer — Circle Pack Layout.
 *
 * Default state: team circles only (sized by total commit volume).
 * Click a team to expand it and reveal its repos packed inside.
 * Click again to collapse.
 *
 * Hovering any bubble draws curved cross-team edges that originate and
 * terminate at circle boundaries (not centers). Edge color = contributing
 * team's color. If the target repo's owning team is collapsed the edge
 * routes to that team's circle boundary instead.
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
  // Persists across redraws so expansion state survives data/filter changes
  const expandedTeams = new Set();

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

    const RING_OUTER = 7; // ring extends this many px beyond the circle edge
    d3.pack()
      .size([w - 8, h - 8])
      // depth-0: gap between team circles; depth-1: must fit the ring on each
      // side of adjacent repos (RING_OUTER * 2) plus a small visual gap
      .padding(d => d.depth === 0 ? 36 : RING_OUTER * 2 + 6)(root);

    svg.attr('width', w).attr('height', h);

    // Arrowhead markers — one per team color, keyed by sanitised color hex
    const defs = svg.append('defs');
    const markerFor = (color) => {
      const id = 'arrow-' + color.replace('#', '');
      if (defs.select(`#${id}`).empty()) {
        defs.append('marker')
          .attr('id', id)
          .attr('viewBox', '0 -4 8 8')
          .attr('refX', 8)
          .attr('refY', 0)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
            .attr('d', 'M0,-4L8,0L0,4Z')
            .attr('fill', color)
            .attr('opacity', 0.72);
      }
      return `url(#${id})`;
    };
    // Pre-create a marker for each team color so they're ready before edges are drawn
    for (const team of teams) markerFor(team.color);

    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    const g = svg.append('g').attr('transform', 'translate(4,4)');

    // ── Position map (absolute coords for all pack nodes) ────────────────────
    const posMap = {};
    for (const d of root.children ?? []) {
      posMap[d.data.id] = { x: d.x, y: d.y, r: d.r, color: d.data.color };
    }
    const allRepoPackNodes = root.descendants().filter(d => d.depth === 2);
    for (const d of allRepoPackNodes) {
      // Use outer ring radius so edge endpoints (and arrowheads) land at the ring edge
      posMap[d.data.id] = { x: d.x, y: d.y, r: d.r + RING_OUTER, color: d.data.teamColor ?? d.parent?.data.color };
    }

    const repoOwnerMap = Object.fromEntries(
      data.nodes.filter(n => n.type === 'repo').map(n => [n.id, n.owningTeamId])
    );
    const repoCommitMap = Object.fromEntries(
      data.nodes.filter(n => n.type === 'repo').map(n => [n.id, n.commits ?? 0])
    );
    const teamColorMap = Object.fromEntries(teams.map(t => [`team:${t.id}`, t.color]));

    // Cross-team links above the violation threshold only
    const crossLinks = data.links.filter(l => {
      if (repoOwnerMap[l.target] === undefined) return false;
      if (l.source.replace('team:', '') === repoOwnerMap[l.target]) return false;
      const repoTotal = repoCommitMap[l.target] ?? 0;
      return repoTotal > 0 && (l.commits / repoTotal) * 100 >= threshold;
    });

    // ── Edge helpers ─────────────────────────────────────────────────────────
    // edgeLayer is appended after all circle groups so SVG DOM order puts
    // edges on top of bubbles (SVG z-order = DOM order, no z-index support)
    let edgeLayer;

    function clearEdges() { edgeLayer?.selectAll('*').remove(); }

    // Quadratic bezier from the boundary of src to the boundary of tgt
    function edgePath(src, tgt) {
      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return '';
      const ux = dx / len, uy = dy / len;
      const x1 = src.x + src.r * ux,  y1 = src.y + src.r * uy;
      const x2 = tgt.x - tgt.r * ux,  y2 = tgt.y - tgt.r * uy;
      const bend = Math.min(len * 0.22, 55);
      const cpx = (x1 + x2) / 2 - uy * bend;
      const cpy = (y1 + y2) / 2 + ux * bend;
      return `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;
    }

    // Route an edge targeting repoId to the repo (if its team is expanded)
    // or to the owning team circle (if collapsed)
    function resolveTarget(repoId) {
      const owningTeamId = repoOwnerMap[repoId];
      return expandedTeams.has(owningTeamId)
        ? posMap[repoId]
        : posMap[`team:${owningTeamId}`];
    }

    function drawEdges(links) {
      clearEdges();
      for (const l of links) {
        const src = posMap[l.source];
        const tgt = resolveTarget(l.target);
        if (!src || !tgt) continue;
        const path = edgePath(src, tgt);
        if (!path) continue;
        const color = teamColorMap[l.source] ?? src.color;
        edgeLayer.append('path')
          .attr('d', path)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('stroke-opacity', 0.72)
          .attr('marker-end', markerFor(color))
          .attr('pointer-events', 'none');
      }
    }

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
      .attr('stroke-opacity', 0.5)
      .attr('cursor', 'pointer');

    teamGs.append('text')
      .attr('class', 'team-label')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', d => Math.min(13, Math.max(9, d.r * 0.12)) + 'px')
      .attr('font-weight', '600')
      .attr('fill', '#374151')
      .attr('pointer-events', 'none')
      .attr('dominant-baseline', 'hanging')
      .attr('y', d => d.r + 6)
      .text(d => d.data.name);

    // ── Repo circles (hidden until team is expanded) ──────────────────────
    const repoNodes = allRepoPackNodes.filter(d => d.data.type === 'repo');

    const repoGs = g.selectAll('g.repo-bubble')
      .data(repoNodes)
      .join('g')
      .attr('class', 'repo-bubble')
      .attr('data-team-id', d => d.data.owningTeamId)
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('display', d => expandedTeams.has(d.data.owningTeamId) ? null : 'none');

    repoGs.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.data.teamColor)
      .attr('fill-opacity', 0.35)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer');

    // Full ownership ring — a 360° donut around each repo circle.
    // Owner's arc comes first (12 o'clock), then other teams sorted by
    // commits desc. Arc angle = team commits / total commits * 2π.
    // Cross-team arcs below the threshold are merged into the owner slice
    // so the ring always completes the full circle.
    const arcGen = d3.arc();
    repoGs.each(function(d) {
      const total = d.data.commits || 0;
      if (!total) return;
      const all = (d.data.contributions ?? []).filter(c => c.commits > 0);
      if (!all.length) return;

      // Separate owner and qualifying cross-team contributors
      const owner  = all.find(c => c.teamId === d.data.owningTeamId);
      const others = all
        .filter(c => c.teamId !== d.data.owningTeamId &&
                     (c.commits / total) * 100 >= threshold)
        .sort((a, b) => b.commits - a.commits);

      // Owner absorbs any below-threshold cross commits so ring stays full
      const ownerCommits = total - others.reduce((s, c) => s + c.commits, 0);
      const slices = [
        { teamColor: owner?.teamColor ?? d.data.teamColor, commits: ownerCommits, isOwner: true },
        ...others,
      ].filter(s => s.commits > 0);

      const innerR = d.r + 3;
      const outerR = d.r + RING_OUTER;
      let angle = -Math.PI / 2; // start at 12 o'clock
      for (const s of slices) {
        const sweep = (s.commits / total) * 2 * Math.PI;
        d3.select(this).insert('path', 'text')
          .attr('d', arcGen({ innerRadius: innerR, outerRadius: outerR, startAngle: angle, endAngle: angle + sweep }))
          .attr('fill', s.teamColor)
          .attr('fill-opacity', s.isOwner ? 0.85 : 0.9)
          .attr('pointer-events', 'none');
        angle += sweep;
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

    // Append edge layer last so it renders on top of all bubbles
    edgeLayer = g.append('g').attr('class', 'edge-layer');

    // ── Team interactions ─────────────────────────────────────────────────
    teamGs
      .on('click', (event, d) => {
        event.stopPropagation();
        const teamId   = d.data.teamId;
        const expanded = !expandedTeams.has(teamId);
        if (expanded) expandedTeams.add(teamId); else expandedTeams.delete(teamId);

        g.selectAll(`g.repo-bubble[data-team-id="${teamId}"]`)
          .style('display', expanded ? null : 'none');

        g.selectAll('g.team-bubble')
          .filter(td => td.data.teamId === teamId)
          .select('text.team-label')
          .attr('dominant-baseline', 'hanging')
          .attr('y', d.r + 6);
      })
      .on('mouseover', (event, d) => {
        event.stopPropagation();
        const teamNodeId = d.data.id;
        const teamId     = d.data.teamId;
        const links = crossLinks.filter(l =>
          l.source === teamNodeId || repoOwnerMap[l.target] === teamId
        );
        drawEdges(links);
        // Inbound: other teams' share of THIS team's total repo commits
        const thisTeamRepoTotal = data.nodes
          .filter(n => n.type === 'repo' && n.owningTeamId === teamId)
          .reduce((s, n) => s + (n.commits ?? 0), 0);
        const inboundMap = {};
        for (const l of crossLinks.filter(l => repoOwnerMap[l.target] === teamId)) {
          const srcId = l.source.replace('team:', '');
          inboundMap[srcId] = (inboundMap[srcId] ?? 0) + (l.commits ?? 0);
        }
        const teamInboundBreakdown = Object.entries(inboundMap)
          .map(([tid, commits]) => ({
            teamId: tid, commits,
            pct: thisTeamRepoTotal > 0 ? +((commits / thisTeamRepoTotal) * 100).toFixed(1) : 0,
          }))
          .sort((a, b) => b.commits - a.commits);

        // Outbound: this team's share of each target team's total repo commits
        const outboundMap = {};
        for (const l of crossLinks.filter(l => l.source === teamNodeId)) {
          const tgtTeamId = repoOwnerMap[l.target];
          if (tgtTeamId) outboundMap[tgtTeamId] = (outboundMap[tgtTeamId] ?? 0) + (l.commits ?? 0);
        }
        const teamOutboundBreakdown = Object.entries(outboundMap)
          .map(([tid, commits]) => {
            const tgtTotal = data.nodes
              .filter(n => n.type === 'repo' && n.owningTeamId === tid)
              .reduce((s, n) => s + (n.commits ?? 0), 0);
            return { teamId: tid, commits, pct: tgtTotal > 0 ? +((commits / tgtTotal) * 100).toFixed(1) : 0 };
          })
          .sort((a, b) => b.commits - a.commits);

        onShowNodeTooltip({
          id: teamNodeId, type: 'team', name: d.data.name,
          commits: d.data.commits, repoCount: d.data.repoCount, authorCount: d.data.authorCount,
          teamInboundBreakdown: teamInboundBreakdown.length ? teamInboundBreakdown : null,
          teamOutboundBreakdown: teamOutboundBreakdown.length ? teamOutboundBreakdown : null,
        }, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.pageX + TOOLTIP_OFFSET.x, e.pageY + TOOLTIP_OFFSET.y))
      .on('mouseout', () => { clearEdges(); onHideTooltip(); });

    // ── Repo interactions ─────────────────────────────────────────────────
    repoGs
      .on('mouseover', (event, d) => {
        event.stopPropagation();
        drawEdges(crossLinks.filter(l => l.target === d.data.id));
        const repoBreakdown = (d.data.contributions ?? [])
          .map(c => ({
            teamId:  c.teamId,
            commits: c.commits,
            pct:     d.data.commits > 0 ? +((c.commits / d.data.commits) * 100).toFixed(1) : 0,
            isOwner: c.teamId === d.data.owningTeamId,
          }))
          .sort((a, b) => (b.isOwner - a.isOwner) || (b.commits - a.commits));
        onShowNodeTooltip({ ...d.data, repoBreakdown }, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
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
