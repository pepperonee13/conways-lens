import * as d3 from 'd3';
import { TOOLTIP_OFFSET } from './graphConstants.js';

/**
 * Hierarchical bubble chart renderer — Circle Pack Layout with force simulation.
 *
 * Default state: team circles only (sized by total commit volume).
 * Click a team to expand it and reveal its repos packed inside.
 * Dragging a team re-heats the simulation so bubbles bounce into place.
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
  const expandedTeams      = new Set();
  const teamSavedPositions = {}; // { teamId: {x,y} } — persists drag positions across redraws
  let   simulation         = null;

  function draw({ dims, data }) {
    if (simulation) { simulation.stop(); simulation = null; }
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

    const RING_OUTER = 7;
    // Pack for sizing only; force sim handles final positions
    d3.pack()
      .size([w - 8, h - 8])
      .padding(d => d.depth === 0 ? 36 : RING_OUTER * 2 + 6)(root);

    // ── Simulation nodes ──────────────────────────────────────────────────────
    // Use previously saved positions so layout survives filter/threshold changes
    const simNodes = (root.children ?? []).map(d => ({
      id:       d.data.teamId,
      packNode: d,
      r:        d.r,
      x:        teamSavedPositions[d.data.teamId]?.x ?? d.x,
      y:        teamSavedPositions[d.data.teamId]?.y ?? d.y,
    }));
    const simNodeByTeamId = Object.fromEntries(simNodes.map(n => [n.id, n]));

    // Repo positions relative to their team's pack center — fixed offsets throughout
    const repoOffsets = {};
    for (const teamD of root.children ?? []) {
      repoOffsets[teamD.data.teamId] = (teamD.children ?? []).map(repoD => ({
        repoD,
        dx: repoD.x - teamD.x,
        dy: repoD.y - teamD.y,
      }));
    }

    // Apply initial sim positions (incl. saved) to pack node coords before drawing
    for (const sn of simNodes) {
      sn.packNode.x = sn.x;
      sn.packNode.y = sn.y;
      for (const { repoD, dx, dy } of repoOffsets[sn.id] ?? []) {
        repoD.x = sn.x + dx;
        repoD.y = sn.y + dy;
      }
    }

    svg.attr('width', w).attr('height', h);

    // Arrowhead markers — one per team color
    const defs = svg.append('defs');
    const markerFor = (color) => {
      const id = 'arrow-' + color.replace('#', '');
      if (defs.select(`#${id}`).empty()) {
        defs.append('marker')
          .attr('id', id)
          .attr('viewBox', '0 -4 8 8')
          .attr('refX', 8).attr('refY', 0)
          .attr('markerWidth', 6).attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
            .attr('d', 'M0,-4L8,0L0,4Z')
            .attr('fill', color).attr('opacity', 0.72);
      }
      return `url(#${id})`;
    };
    for (const team of teams) markerFor(team.color);

    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    const g = svg.append('g').attr('transform', 'translate(4,4)');

    // ── Position map — rebuilt on every simulation tick ───────────────────────
    const posMap = {};
    function syncPosMap() {
      for (const sn of simNodes) {
        posMap[`team:${sn.id}`] = { x: sn.x, y: sn.y, r: sn.packNode.r, color: sn.packNode.data.color };
        for (const { repoD } of repoOffsets[sn.id] ?? []) {
          posMap[repoD.data.id] = {
            x: repoD.x, y: repoD.y,
            r: repoD.r + RING_OUTER,
            color: repoD.data.teamColor ?? sn.packNode.data.color,
          };
        }
      }
    }
    syncPosMap();

    const repoOwnerMap  = Object.fromEntries(data.nodes.filter(n => n.type === 'repo').map(n => [n.id, n.owningTeamId]));
    const repoCommitMap = Object.fromEntries(data.nodes.filter(n => n.type === 'repo').map(n => [n.id, n.commits ?? 0]));
    const teamColorMap  = Object.fromEntries(teams.map(t => [`team:${t.id}`, t.color]));

    // Cross-team links above the violation threshold only
    const crossLinks = data.links.filter(l => {
      if (repoOwnerMap[l.target] === undefined) return false;
      if (l.source.replace('team:', '') === repoOwnerMap[l.target]) return false;
      const repoTotal = repoCommitMap[l.target] ?? 0;
      return repoTotal > 0 && (l.commits / repoTotal) * 100 >= threshold;
    });

    // ── Edge helpers ──────────────────────────────────────────────────────────
    // edgeLayer appended after all circles so it renders on top (SVG z = DOM order)
    let edgeLayer;
    let activeLinks = null; // links currently displayed — redrawn on every tick

    function edgePath(src, tgt) {
      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return '';
      const ux = dx / len, uy = dy / len;
      const x1 = src.x + src.r * ux, y1 = src.y + src.r * uy;
      const x2 = tgt.x - tgt.r * ux, y2 = tgt.y - tgt.r * uy;
      const bend = Math.min(len * 0.22, 55);
      const cpx = (x1 + x2) / 2 - uy * bend;
      const cpy = (y1 + y2) / 2 + ux * bend;
      return `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;
    }

    function resolveTarget(repoId) {
      const owningTeamId = repoOwnerMap[repoId];
      return expandedTeams.has(owningTeamId) ? posMap[repoId] : posMap[`team:${owningTeamId}`];
    }

    function renderEdges(links) {
      edgeLayer?.selectAll('*').remove();
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

    function drawEdges(links) { activeLinks = links; renderEdges(links); }
    function clearEdges()      { activeLinks = null;  edgeLayer?.selectAll('*').remove(); }

    g.on('mouseleave', clearEdges);

    // ── Team circles ──────────────────────────────────────────────────────────
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
      .attr('cursor', 'grab');

    teamGs.append('text')
      .attr('class', 'team-label')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', d => Math.min(13, Math.max(9, d.r * 0.12)) + 'px')
      .attr('font-weight', '600')
      .attr('fill', '#374151')
      .attr('pointer-events', 'none')
      .attr('dominant-baseline', d => expandedTeams.has(d.data.teamId) ? 'auto' : 'middle')
      .attr('y', d => expandedTeams.has(d.data.teamId) ? -(d.r - 16) : 0)
      .text(d => d.data.name);

    // ── Repo circles ──────────────────────────────────────────────────────────
    const allRepoPackNodes = root.descendants().filter(d => d.depth === 2);
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

    const arcGen = d3.arc();
    repoGs.each(function(d) {
      const total = d.data.commits || 0;
      if (!total) return;
      const all = (d.data.contributions ?? []).filter(c => c.commits > 0);
      if (!all.length) return;

      const owner  = all.find(c => c.teamId === d.data.owningTeamId);
      const others = all
        .filter(c => c.teamId !== d.data.owningTeamId && (c.commits / total) * 100 >= threshold)
        .sort((a, b) => b.commits - a.commits);

      const ownerCommits = total - others.reduce((s, c) => s + c.commits, 0);
      const slices = [
        { teamColor: owner?.teamColor ?? d.data.teamColor, commits: ownerCommits, isOwner: true },
        ...others,
      ].filter(s => s.commits > 0);

      const innerR = d.r + 3, outerR = d.r + RING_OUTER;
      let angle = -Math.PI / 2;
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

    // Edge layer last so it renders on top of all bubbles
    edgeLayer = g.append('g').attr('class', 'edge-layer');

    // ── Force simulation ──────────────────────────────────────────────────────
    simulation = d3.forceSimulation(simNodes)
      .force('collide', d3.forceCollide(d => d.r + 20).strength(0.85).iterations(3))
      .force('charge',  d3.forceManyBody().strength(-20))
      .force('x',       d3.forceX(w / 2).strength(0.04))
      .force('y',       d3.forceY(h / 2).strength(0.04))
      .on('tick', () => {
        for (const sn of simNodes) {
          sn.packNode.x = sn.x;
          sn.packNode.y = sn.y;
          teamSavedPositions[sn.id] = { x: sn.x, y: sn.y };
          for (const { repoD, dx, dy } of repoOffsets[sn.id] ?? []) {
            repoD.x = sn.x + dx;
            repoD.y = sn.y + dy;
          }
        }
        syncPosMap();
        teamGs.attr('transform', d => `translate(${d.x},${d.y})`);
        g.selectAll('g.repo-bubble').attr('transform', d => `translate(${d.x},${d.y})`);
        if (activeLinks) renderEdges(activeLinks); // keep edges in sync while moving
      });

    // ── Drag (team bubbles) ───────────────────────────────────────────────────
    // We detect click vs drag by distance — D3 v7 may suppress the browser
    // click event after pointerdown, so we handle expand/collapse in drag.end.
    let dragMoved = false;
    let dragStartX = 0, dragStartY = 0;

    function toggleExpand(d) {
      const teamId  = d.data.teamId;
      const expanded = !expandedTeams.has(teamId);
      if (expanded) expandedTeams.add(teamId); else expandedTeams.delete(teamId);
      g.selectAll(`g.repo-bubble[data-team-id="${teamId}"]`)
        .style('display', expanded ? null : 'none');
      g.selectAll('g.team-bubble')
        .filter(td => td.data.teamId === teamId)
        .select('text.team-label')
        .attr('dominant-baseline', expanded ? 'auto' : 'middle')
        .attr('y', expanded ? -(d.r - 16) : 0);
    }

    const teamDrag = d3.drag()
      .on('start', function(event, d) {
        dragMoved  = false;
        dragStartX = event.x; dragStartY = event.y;
        const sn   = simNodeByTeamId[d.data.teamId];
        sn.fx = sn.x; sn.fy = sn.y;
      })
      .on('drag', (event, d) => {
        const dist = Math.hypot(event.x - dragStartX, event.y - dragStartY);
        if (!dragMoved && dist > 4) {
          dragMoved = true;
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d3.select(event.sourceEvent.target.closest?.('g.team-bubble') ?? event.currentTarget)
            .select('circle').attr('cursor', 'grabbing');
        }
        if (!dragMoved) return;
        const k  = d3.zoomTransform(svg.node()).k;
        const sn = simNodeByTeamId[d.data.teamId];
        sn.fx += event.dx / k;
        sn.fy += event.dy / k;
      })
      .on('end', function(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        const sn = simNodeByTeamId[d.data.teamId];
        sn.fx = null; sn.fy = null;
        d3.select(this).select('circle').attr('cursor', 'grab');
        if (!dragMoved) toggleExpand(d);
        dragMoved = false; // reset so tooltips work immediately after drag
      });

    teamGs.call(teamDrag);

    // ── Team interactions ─────────────────────────────────────────────────────
    teamGs
      .on('mouseover', (event, d) => {
        if (dragMoved) return;
        event.stopPropagation();
        const teamNodeId = d.data.id;
        const teamId     = d.data.teamId;
        drawEdges(crossLinks.filter(l =>
          l.source === teamNodeId || repoOwnerMap[l.target] === teamId
        ));

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
          teamInboundBreakdown:  teamInboundBreakdown.length  ? teamInboundBreakdown  : null,
          teamOutboundBreakdown: teamOutboundBreakdown.length ? teamOutboundBreakdown : null,
        }, event.pageX + TOOLTIP_OFFSET.x, event.pageY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.pageX + TOOLTIP_OFFSET.x, e.pageY + TOOLTIP_OFFSET.y))
      .on('mouseout', () => { clearEdges(); onHideTooltip(); });

    // ── Repo interactions ─────────────────────────────────────────────────────
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
    if (simulation) { simulation.stop(); simulation = null; }
    if (svgRef.value) d3.select(svgRef.value).selectAll('*').remove();
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
