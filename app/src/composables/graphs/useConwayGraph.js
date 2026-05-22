import * as d3 from 'd3';

/**
 * Conway's Law violation renderer — Sector Layout.
 *
 * The canvas is divided into equal wedges, one per team. Every repo a team
 * owns is always placed inside that team's wedge. Team pills sit OUTSIDE
 * the outer ring as visual anchors and the source endpoint for every
 * cross-team contribution edge.
 *
 * Ownership boundaries are the radial sector lines. Any edge crossing one
 * is a violation. Geometric guarantee — no physics, no drag.
 */
export function useConwayGraph({
  svgRef,
  effectiveTeams,
  getNodeColor,
  onShowNodeTooltip,
  onShowLinkTooltip,
  onMoveTooltip,
  onHideTooltip,
  edgeWeight,
  violationThreshold,
}) {
  const EDGE_OPACITY  = 0.55;
  const EDGE_HL_COLOR = '#225EA9';
  const DIM_OPACITY   = 0.08;

  let nodeEls = null;
  let linkEls = null;

  // ── Geometry ──────────────────────────────────────────────────────────────

  function squareEdgeDist(ux, uy, hw, hh) {
    const tx = Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
  }

  function pillHalfDims(d) {
    return { hw: d.r + 14, hh: d.r };
  }

  function sectorArcPath(cx, cy, r0, r1, a0, a1) {
    const large = (a1 - a0 > Math.PI) ? 1 : 0;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    return [
      `M${cx + r0*c0},${cy + r0*s0}`,
      `L${cx + r1*c0},${cy + r1*s0}`,
      `A${r1},${r1},0,${large},1,${cx + r1*c1},${cy + r1*s1}`,
      `L${cx + r0*c1},${cy + r0*s1}`,
      `A${r0},${r0},0,${large},0,${cx + r0*c0},${cy + r0*s0}`,
      'Z',
    ].join(' ');
  }

  function edgePath(d) {
    if (!d.source || !d.target) return '';
    const sx = d.source.x, sy = d.source.y;
    const tx = d.target.x, ty = d.target.y;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/len, uy = dy/len;

    const { hw: sHW, hh: sHH } = pillHalfDims(d.source);
    const srcOff = squareEdgeDist(ux, uy, sHW, sHH) + 3;
    const tgtOff = squareEdgeDist(ux, uy, d.target.r, d.target.r) + 8; // +8 to clear violation ring

    const x1 = sx + ux * srcOff, y1 = sy + uy * srcOff;
    const x2 = tx - ux * tgtOff, y2 = ty - uy * tgtOff;
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return '';
    return `M${x1},${y1} L${x2},${y2}`;
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  // Returns geometry derived from canvas dims and team count.
  function computeGeometry(dims) {
    const { w, h } = dims;
    const cx = w / 2, cy = h / 2;
    const N = effectiveTeams.value.length;
    // Outer ring: leave room for team pills outside.
    const outerR = Math.min(w, h) * 0.40;
    const innerR = 24;
    const pillR  = outerR + 38;
    const sectorAngle = N > 0 ? (2 * Math.PI) / N : 0;
    const gap = N > 1 ? 0.024 : 0;
    return { cx, cy, outerR, innerR, pillR, sectorAngle, gap, N };
  }

  function sectorAnglesFor(i, g) {
    const start0 = -Math.PI / 2 + i * g.sectorAngle;
    return { sStart: start0 + g.gap / 2, sEnd: start0 + g.sectorAngle - g.gap / 2 };
  }

  function computeLayout(dims) {
    const g = computeGeometry(dims);
    if (g.N === 0) return {};
    const positions = {};
    const teams = effectiveTeams.value;
    // Repo → owningTeamId for quick lookup
    const repoTeam = {};
    teams.forEach(t => (t.repos ?? []).forEach(r => { repoTeam[r] = t.id; }));

    teams.forEach((team, i) => {
      const { sStart, sEnd } = sectorAnglesFor(i, g);
      const sMid = (sStart + sEnd) / 2;
      positions[`team:${team.id}`] = {
        x: g.cx + g.pillR * Math.cos(sMid),
        y: g.cy + g.pillR * Math.sin(sMid),
      };
      const repos = team.repos ?? [];
      Object.assign(positions, layoutReposInSector(
        repos, sStart, sEnd, g.cx, g.cy, g.innerR + 12, g.outerR - 24
      ));
    });
    return positions;
  }

  function layoutReposInSector(repos, sStart, sEnd, cx, cy, rMin, rMax) {
    if (!repos.length) return {};
    const n = repos.length;
    const sectorAngle = sEnd - sStart;
    const angPad = Math.min(0.18, sectorAngle * 0.10);
    const usable = sectorAngle - 2 * angPad;
    const midR = (rMin + rMax) * 0.5;
    const slotSize = 44;
    const maxPerRing = Math.max(1, Math.floor((midR * usable) / slotSize));
    const nRings = Math.ceil(n / maxPerRing);
    const perRing = Math.ceil(n / nRings);
    const radStep = nRings > 1 ? (rMax - rMin) / (nRings - 1) : 0;

    const positions = {};
    repos.forEach((repo, j) => {
      const ring = Math.floor(j / perRing);
      const posInRing = j % perRing;
      const ringCount = Math.min(perRing, n - ring * perRing);
      const r = nRings > 1 ? rMin + ring * radStep : midR;
      const angle = ringCount === 1
        ? sStart + angPad + usable / 2
        : sStart + angPad + (posInRing + 0.5) * usable / ringCount;
      positions[repo] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return positions;
  }

  // ── Sector backgrounds ────────────────────────────────────────────────────

  function drawSectors(root, dims) {
    const g = computeGeometry(dims);
    if (g.N === 0) return;
    const layer = root.append('g').attr('class', 'sectors').attr('pointer-events', 'none');

    effectiveTeams.value.forEach((team, i) => {
      const { sStart, sEnd } = sectorAnglesFor(i, g);
      layer.append('path')
        .attr('d', sectorArcPath(g.cx, g.cy, g.innerR, g.outerR, sStart, sEnd))
        .attr('fill', team.color + '10')
        .attr('stroke', team.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.45);
    });

    // Outer ring
    layer.append('circle')
      .attr('cx', g.cx).attr('cy', g.cy).attr('r', g.outerR)
      .attr('fill', 'none').attr('stroke', '#e2e8f0').attr('stroke-width', 1);
  }

  // ── Edge styling ──────────────────────────────────────────────────────────

  function edgeStroke(d) {
    return edgeWeight.value ? (d.source?.color ?? '#94a3b8') : '#94a3b8';
  }

  function edgeWidth(d) {
    return edgeWeight.value ? Math.max(1, 1 + Math.log1p(d.commits) * 0.9) : 1.5;
  }

  function updateEdgeStyles() {
    if (!linkEls) return;
    linkEls
      .attr('stroke',         d => edgeStroke(d))
      .attr('stroke-width',   d => edgeWidth(d))
      .attr('stroke-opacity', EDGE_OPACITY);
  }

  function updateNodeColors() {
    if (!nodeEls) return;
    nodeEls.filter(d => d.type === 'repo').select('rect.repo-fill')
      .attr('stroke', d => d.color);
  }

  // ── Highlight ─────────────────────────────────────────────────────────────

  function highlightNode(d) {
    if (!nodeEls || !linkEls) return;
    const connected = new Set([d.id]);
    linkEls.each(l => {
      if (l.source.id === d.id || l.target.id === d.id) {
        connected.add(l.source.id); connected.add(l.target.id);
      }
    });
    nodeEls.attr('opacity', n => connected.has(n.id) ? 1 : DIM_OPACITY);
    linkEls
      .attr('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? EDGE_HL_COLOR : edgeStroke(l))
      .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.9 : DIM_OPACITY);
  }

  function highlightLink(d) {
    if (!nodeEls || !linkEls) return;
    nodeEls.attr('opacity', n => (n.id === d.source.id || n.id === d.target.id) ? 1 : DIM_OPACITY);
    linkEls
      .attr('stroke', l => l === d ? EDGE_HL_COLOR : edgeStroke(l))
      .attr('stroke-opacity', l => l === d ? 0.9 : DIM_OPACITY);
  }

  function resetHighlight() {
    if (!nodeEls || !linkEls) return;
    nodeEls.attr('opacity', 1);
    updateEdgeStyles();
  }

  // ── Violation rings ───────────────────────────────────────────────────────

  function drawRings() {
    if (!nodeEls) return;
    const threshold = violationThreshold.value;
    const arcGen = d3.arc();

    nodeEls.filter(d => d.type === 'repo').each(function(d) {
      d3.select(this).selectAll('.violation-arc').remove();
      if (!d.contributions || d.commits === 0) return;

      const outside = d.contributions.filter(c =>
        c.teamId !== d.owningTeamId && (c.commits / d.commits) * 100 >= threshold
      );
      if (!outside.length) return;

      const innerR = d.r + 3, outerR = d.r + 9;
      let startAngle = -Math.PI / 2;
      for (const c of outside) {
        const endAngle = startAngle + (c.commits / d.commits) * 2 * Math.PI;
        d3.select(this).append('path')
          .attr('class', 'violation-arc')
          .attr('d', arcGen({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle }))
          .attr('fill', c.teamColor).attr('opacity', 0.95)
          .attr('pointer-events', 'none');
        startAngle = endAngle;
      }
    });
  }

  function drawOverlays() { drawRings(); }

  // ── Full draw ─────────────────────────────────────────────────────────────

  function draw({ dims, data }) {
    if (!svgRef.value || !data.nodes.length) return;

    const { w, h } = dims;
    const positions = computeLayout(dims);

    const teamMax = d3.max(data.nodes.filter(n => n.type === 'team'), n => n.commits) || 1;
    const repoMax = d3.max(data.nodes.filter(n => n.type === 'repo'), n => n.commits) || 1;
    const teamScale = d3.scaleSqrt().domain([0, teamMax]).range([18, 38]);
    const repoScale = d3.scaleSqrt().domain([0, repoMax]).range([10, 22]);

    const nodes = data.nodes.map(n => ({
      ...n,
      r: n.type === 'team' ? teamScale(n.commits || 1) : repoScale(n.commits || 1),
      x: positions[n.id]?.x ?? w / 2,
      y: positions[n.id]?.y ?? h / 2,
    }));

    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = data.links.map(l => ({
      ...l,
      source: nodeById[typeof l.source === 'object' ? l.source.id : l.source],
      target: nodeById[typeof l.target === 'object' ? l.target.id : l.target],
    })).filter(l => l.source && l.target);

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow-conway')
      .attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
      .attr('markerWidth', 12).attr('markerHeight', 12)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.5, 4]).on('zoom', e => root.attr('transform', e.transform)));

    drawSectors(root, dims);

    // Edges
    linkEls = root.append('g')
      .selectAll('path').data(links).join('path')
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-conway)')
      .attr('d', d => edgePath(d))
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        highlightLink(d);
        onShowLinkTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + 14, e.clientY - 10))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    updateEdgeStyles();

    // Nodes
    nodeEls = root.append('g')
      .selectAll('g').data(nodes).join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        onShowNodeTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + 14, e.clientY - 10))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    // Team pill (single style — always shown outside the outer ring)
    nodeEls.filter(d => d.type === 'team')
      .append('rect')
      .attr('x', d => -(d.r + 14)).attr('y', d => -d.r)
      .attr('width', d => (d.r + 14) * 2).attr('height', d => d.r * 2)
      .attr('rx', d => d.r)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 3)
      .attr('opacity', 0.95);

    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', '-0.15em')
      .attr('fill', '#fff').attr('font-size', '12px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('fill', 'rgba(255,255,255,0.78)').attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text(d => `${d.repoCount} ${d.repoCount === 1 ? 'repo' : 'repos'} · ${d.authorCount} ${d.authorCount === 1 ? 'dev' : 'devs'}`);

    // Repo squares: white fill, team-colored thick stroke (visible against same-team sector bg)
    nodeEls.filter(d => d.type === 'repo')
      .append('rect')
      .attr('class', 'repo-fill')
      .attr('x', d => -d.r).attr('y', d => -d.r)
      .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
      .attr('rx', 4)
      .attr('fill', '#ffffff')
      .attr('stroke', d => d.color || '#9CA3AF').attr('stroke-width', 3)
      .attr('opacity', 1);

    // Repo label — short id (last path segment) to reduce collisions
    nodeEls.filter(d => d.type === 'repo')
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', d => d.r + 12)
      .attr('fill', '#374151').attr('font-size', '10px').attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => shortLabel(d.id));

    drawRings();
  }

  function shortLabel(id) {
    if (!id) return '';
    const s = String(id);
    const last = s.split(/[\/.]/).pop();
    return last.length > 14 ? last.slice(0, 13) + '…' : last;
  }

  function teardown() {
    nodeEls = null;
    linkEls = null;
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
