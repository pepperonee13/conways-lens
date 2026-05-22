import * as d3 from 'd3';

/**
 * Conway's Law violation renderer — Sector Layout.
 *
 * The canvas is divided into equal wedges, one per team. A team's repos
 * are always placed inside its wedge. Ownership boundaries are the sector
 * lines themselves, so hull overlap is geometrically impossible.
 *
 * Any contribution edge that crosses a sector boundary is a violation.
 */
export function useConwayGraph({
  svgRef,
  effectiveTeams,
  expandedTeams,
  getNodeColor,
  toggleTeamExpansion,
  savedPositions,
  onShowNodeTooltip,
  onShowLinkTooltip,
  onMoveTooltip,
  onHideTooltip,
  config,
  edgeWeight,
  violationThreshold,
}) {
  const EDGE_OPACITY  = 0.65;
  const EDGE_HL_COLOR = '#225EA9';
  const DIM_OPACITY   = 0.08;

  let nodeEls    = null;
  let linkEls    = null;
  let currentNodes = [];   // live array — updated on drag for edge re-routing

  // ── Geometry helpers ──────────────────────────────────────────────────────

  function squareEdgeDist(ux, uy, hw, hh) {
    const tx = Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
  }

  function pillHalfDims(d) {
    return d.isExpanded
      ? { hw: d.r + 10, hh: d.r * 0.7 }
      : { hw: d.r + 14, hh: d.r };
  }

  // Annular sector path: inner radius r0, outer radius r1, angles a0→a1 (radians, screen coords)
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

  // SVG path for a single contribution edge (straight line with boundary offsets)
  function edgePath(d) {
    if (!d.source || !d.target) return '';
    const sx = d.source.x, sy = d.source.y;
    const tx = d.target.x, ty = d.target.y;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/len, uy = dy/len;

    const { hw: sHW, hh: sHH } = pillHalfDims(d.source);
    const srcOff = squareEdgeDist(ux, uy, sHW, sHH) + 3;

    let tgtOff;
    if (d.target.type === 'team') {
      const { hw: tHW, hh: tHH } = pillHalfDims(d.target);
      tgtOff = squareEdgeDist(ux, uy, tHW, tHH) + 3;
    } else {
      tgtOff = squareEdgeDist(ux, uy, d.target.r, d.target.r) + 2;
    }

    const x1 = sx + ux * srcOff, y1 = sy + uy * srcOff;
    const x2 = tx - ux * tgtOff, y2 = ty - uy * tgtOff;
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return '';
    return `M${x1},${y1} L${x2},${y2}`;
  }

  // ── Sector layout computation ─────────────────────────────────────────────

  function computeLayout(dims) {
    const { w, h } = dims;
    const cx = w / 2, cy = h / 2;
    const teams = effectiveTeams.value;
    const N = teams.length;
    if (N === 0) return {};

    const outerR      = Math.min(w, h) * 0.46;
    const innerR      = 18;
    const teamAnchorR = outerR * 0.88;
    const sectorAngle = (2 * Math.PI) / N;

    const positions = {};

    teams.forEach((team, i) => {
      const sStart = -Math.PI / 2 + i * sectorAngle;
      const sEnd   = sStart + sectorAngle;
      const sMid   = (sStart + sEnd) / 2;

      positions[`team:${team.id}`] = {
        x: cx + teamAnchorR * Math.cos(sMid),
        y: cy + teamAnchorR * Math.sin(sMid),
      };

      if (expandedTeams.value.has(team.id)) {
        const repos = team.repos ?? [];
        const reps  = layoutReposInSector(repos, sStart, sEnd, cx, cy, innerR, outerR - 24);
        Object.assign(positions, reps);
      }
    });

    return positions;
  }

  // Place repos in a polar grid within a sector.
  // Distributes angularly first (maximise separation), adding radial rows as needed.
  function layoutReposInSector(repos, sStart, sEnd, cx, cy, rMin, rMax) {
    if (!repos.length) return {};
    const n           = repos.length;
    const sectorAngle = sEnd - sStart;
    const angPad      = Math.min(0.22, sectorAngle * 0.13);
    const usable      = sectorAngle - 2 * angPad;
    const midR        = (rMin + rMax) * 0.5;
    const slotSize    = 28; // px per angular slot
    const maxPerRing  = Math.max(1, Math.floor((midR * usable) / slotSize));
    const nRings      = Math.ceil(n / maxPerRing);
    const perRing     = Math.ceil(n / nRings);
    const radStep     = nRings > 1 ? (rMax - rMin) / (nRings - 1) : 0;

    const positions = {};
    repos.forEach((repo, j) => {
      const ring        = Math.floor(j / perRing);
      const posInRing   = j % perRing;
      const ringCount   = Math.min(perRing, n - ring * perRing);
      const r           = rMin + ring * radStep;
      const angle       = sStart + angPad + (posInRing + 0.5) * usable / ringCount;
      positions[repo]   = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return positions;
  }

  // ── Sector drawing ────────────────────────────────────────────────────────

  function drawSectors(root, dims) {
    const { w, h } = dims;
    const cx = w / 2, cy = h / 2;
    const N  = effectiveTeams.value.length;
    if (N === 0) return;

    const outerR      = Math.min(w, h) * 0.46;
    const innerR      = 18;
    const sectorAngle = (2 * Math.PI) / N;
    const gap         = N > 1 ? 0.028 : 0;

    const g = root.append('g').attr('class', 'sectors').attr('pointer-events', 'none');

    effectiveTeams.value.forEach((team, i) => {
      const sStart     = -Math.PI / 2 + i * sectorAngle + gap / 2;
      const sEnd       = sStart + sectorAngle - gap;
      const isExpanded = expandedTeams.value.has(team.id);

      g.append('path')
        .attr('d', sectorArcPath(cx, cy, innerR, outerR, sStart, sEnd))
        .attr('fill',          team.color + (isExpanded ? '1C' : '0A'))
        .attr('stroke',        team.color)
        .attr('stroke-width',  isExpanded ? 2 : 1.5)
        .attr('stroke-dasharray', isExpanded ? '6 3' : 'none')
        .attr('stroke-opacity', isExpanded ? 0.85 : 0.40);
    });
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
    nodeEls.filter(d => d.type === 'repo').select('rect')
      .attr('fill', d => d.color);
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
      if (!d.owningTeamId || !d.contributions || d.commits === 0) return;

      const outside = d.contributions.filter(c =>
        c.teamId !== d.owningTeamId && (c.commits / d.commits) * 100 >= threshold
      );
      if (!outside.length) return;

      const innerR = d.r + 4, outerR = d.r + 14;
      let startAngle = -Math.PI / 2;
      for (const c of outside) {
        const endAngle = startAngle + (c.commits / d.commits) * 2 * Math.PI;
        d3.select(this).append('path')
          .attr('class', 'violation-arc')
          .attr('d', arcGen({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle }))
          .attr('fill', c.teamColor).attr('opacity', 0.9)
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
    const teamScale = d3.scaleSqrt().domain([0, teamMax]).range([18, 46]);
    const repoScale = d3.scaleSqrt().domain([0, repoMax]).range([10, 28]);

    const nodes = data.nodes.map(n => ({
      ...n,
      r: n.type === 'team' ? teamScale(n.commits || 1) : repoScale(n.commits || 1),
      x: savedPositions[n.id]?.x ?? positions[n.id]?.x ?? w / 2,
      y: savedPositions[n.id]?.y ?? positions[n.id]?.y ?? h / 2,
    }));
    currentNodes = nodes;

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
      .attr('markerWidth', 14).attr('markerHeight', 14)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.15, 4]).on('zoom', e => root.attr('transform', e.transform)));

    // 1 — Sector backgrounds (ownership boundaries)
    drawSectors(root, dims);

    // 2 — Edges
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

    // 3 — Nodes
    nodeEls = root.append('g')
      .selectAll('g').data(nodes).join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', d => d.type === 'team' ? 'pointer' : 'grab')
      .call(d3.drag()
        .on('start', (e, d) => { d._moved = false; })
        .on('drag',  function(e, d) {
          d._moved = true;
          d.x = e.x; d.y = e.y;
          savedPositions[d.id] = { x: d.x, y: d.y };
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
          linkEls.filter(l => l.source.id === d.id || l.target.id === d.id)
            .attr('d', l => edgePath(l));
        })
        .on('end', (e, d) => { if (d._moved) d._moved = false; })
      )
      .on('click', (e, d) => {
        if (d._moved) { d._moved = false; return; }
        if (d.type === 'team') toggleTeamExpansion(d.teamId);
      })
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        onShowNodeTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + 14, e.clientY - 10))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    // Collapsed team pill
    nodeEls.filter(d => d.type === 'team' && !d.isExpanded)
      .append('rect')
      .attr('x', d => -(d.r + 14)).attr('y', d => -d.r)
      .attr('width', d => (d.r + 14) * 2).attr('height', d => d.r * 2)
      .attr('rx', d => d.r)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 3).attr('opacity', 0.95);

    // Expanded team anchor (dashed border)
    nodeEls.filter(d => d.type === 'team' && d.isExpanded)
      .append('rect')
      .attr('x', d => -(d.r + 10)).attr('y', d => -(d.r * 0.7))
      .attr('width', d => (d.r + 10) * 2).attr('height', d => d.r * 1.4)
      .attr('rx', d => d.r * 0.7)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .attr('stroke-dasharray', '5 3').attr('opacity', 0.88);

    // Team label
    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.isExpanded ? '0.38em' : '-0.15em')
      .attr('fill', '#fff')
      .attr('font-size', d => d.isExpanded ? '11px' : '13px')
      .attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    // Team sub-label (collapsed only)
    nodeEls.filter(d => d.type === 'team' && !d.isExpanded)
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', '1.1em')
      .attr('fill', 'rgba(255,255,255,0.75)').attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text(d => `${d.repoCount} ${d.repoCount === 1 ? 'repo' : 'repos'} · ${d.authorCount} ${d.authorCount === 1 ? 'dev' : 'devs'}`);

    // Expand / collapse badge
    nodeEls.filter(d => d.type === 'team')
      .append('circle')
      .attr('cx', d => d.isExpanded ? d.r + 6  : d.r + 10)
      .attr('cy', d => d.isExpanded ? -(d.r * 0.7) : -d.r)
      .attr('r', 8)
      .attr('fill', d => d.isExpanded ? '#F08223' : '#22c55e')
      .attr('stroke', '#fff').attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('x', d => d.isExpanded ? d.r + 6  : d.r + 10)
      .attr('y', d => d.isExpanded ? -(d.r * 0.7) : -d.r)
      .attr('text-anchor', 'middle').attr('dy', '0.38em')
      .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.isExpanded ? '−' : '+');

    // Bounded context squares
    nodeEls.filter(d => d.type === 'repo')
      .append('rect')
      .attr('x', d => -d.r).attr('y', d => -d.r)
      .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
      .attr('rx', 4)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

    // Bounded context label
    nodeEls.filter(d => d.type === 'repo')
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', d => d.r + 13)
      .attr('fill', '#374151').attr('font-size', '11px').attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => d.id);

    // Initial violation rings
    drawRings();
  }

  // ── Teardown ──────────────────────────────────────────────────────────────

  function teardown() {
    nodeEls      = null;
    linkEls      = null;
    currentNodes = [];
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
