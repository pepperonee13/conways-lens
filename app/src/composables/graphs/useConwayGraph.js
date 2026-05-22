import * as d3 from 'd3';

/**
 * Conway's Law violation renderer.
 *
 * Teams and bounded contexts (repos) are the only nodes.
 * Every edge is a cross-team contribution — it originates from a team node
 * and terminates at a bounded context node (or a collapsed team node that
 * stands in for its repos).
 *
 * Any edge that visually crosses an ownership boundary hull is a violation.
 * Violation rings on repo nodes encode the ratio of outside-team commits.
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

  let nodeEls   = null;
  let linkEls   = null;
  let hullGroup = null;
  let sim       = null;
  let simNodes  = null;

  // ── Geometry helpers ──────────────────────────────────────────────────────

  function squareEdgeDist(ux, uy, halfW, halfH) {
    const tx = Math.abs(ux) > 1e-9 ? halfW / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-9 ? halfH / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
  }

  function pillHalfDims(d) {
    // Collapsed pill: full size. Expanded anchor: slimmer pill.
    return d.isExpanded
      ? { hw: d.r + 10, hh: d.r * 0.7 }
      : { hw: d.r + 14, hh: d.r };
  }

  function teamHullPath(pts, padding) {
    const samples = [];
    for (const [x, y, r] of pts) {
      const rad = (r ?? 20) + padding;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        samples.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
      }
    }
    const hull = d3.polygonHull(samples);
    return hull ? `M${hull.join('L')}Z` : null;
  }

  // ── Edge styling ──────────────────────────────────────────────────────────

  function edgeStroke(d) {
    if (!edgeWeight.value) return '#94a3b8';
    return d.source.color ?? '#94a3b8';
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
        connected.add(l.source.id);
        connected.add(l.target.id);
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

  // ── Ownership hulls ───────────────────────────────────────────────────────

  function drawHulls() {
    if (!hullGroup || !simNodes) return;
    hullGroup.selectAll('*').remove();

    for (const t of effectiveTeams.value) {
      if (!expandedTeams.value.has(t.id)) continue;

      const pts = simNodes
        .filter(n => n.x != null && (
          (n.type === 'team'  && n.teamId      === t.id) ||
          (n.type === 'repo'  && n.owningTeamId === t.id)
        ))
        .map(n => [n.x, n.y, n.r]);

      if (pts.length < 1) continue;
      const path = teamHullPath(pts, 38);
      if (!path) continue;

      hullGroup.append('path').attr('d', path)
        .attr('fill',            t.color + '1E')
        .attr('stroke',          t.color)
        .attr('stroke-width',    2)
        .attr('stroke-dasharray','6 4')
        .attr('stroke-opacity',  0.7);
    }
  }

  // ── Violation rings ───────────────────────────────────────────────────────
  // Each arc covers (teamCommits / totalRepoCommits) of the circle.
  // Empty arc space = owning team's healthy contribution.

  function drawRings() {
    if (!nodeEls) return;
    const threshold = violationThreshold.value;
    const arcGen = d3.arc();

    nodeEls.filter(d => d.type === 'repo').each(function(d) {
      d3.select(this).selectAll('.violation-arc').remove();
      if (!d.owningTeamId || !d.contributions || d.commits === 0) return;

      const outside = d.contributions.filter(c =>
        c.teamId !== d.owningTeamId &&
        (c.commits / d.commits) * 100 >= threshold
      );
      if (outside.length === 0) return;

      const innerR = d.r + 4;
      const outerR = d.r + 14;
      let startAngle = -Math.PI / 2;

      for (const c of outside) {
        const endAngle = startAngle + (c.commits / d.commits) * 2 * Math.PI;
        d3.select(this).append('path')
          .attr('class', 'violation-arc')
          .attr('d', arcGen({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle }))
          .attr('fill',            c.teamColor)
          .attr('opacity',         0.9)
          .attr('pointer-events',  'none');
        startAngle = endAngle;
      }
    });
  }

  function drawOverlays() {
    drawHulls();
    drawRings();
  }

  // ── Full draw ─────────────────────────────────────────────────────────────

  function draw({ dims, data }) {
    if (!svgRef.value || !data.nodes.length) return;
    if (sim) { sim.stop(); sim = null; }

    const { w, h } = dims;
    const cfg = config;

    const teamMax = d3.max(data.nodes.filter(n => n.type === 'team'), n => n.commits) || 1;
    const repoMax = d3.max(data.nodes.filter(n => n.type === 'repo'), n => n.commits) || 1;
    const teamScale = d3.scaleSqrt().domain([0, teamMax]).range([20, 50]);
    const repoScale = d3.scaleSqrt().domain([0, repoMax]).range([12, 35]);

    const nodes = data.nodes.map(n => ({
      ...n,
      r: n.type === 'team' ? teamScale(n.commits || 1) : repoScale(n.commits || 1),
      x: savedPositions[n.id]?.x,
      y: savedPositions[n.id]?.y,
    }));
    const links = data.links.map(l => ({ ...l }));

    // Set of expanded team ids — used by radial force strength
    const expandedSet = new Set(nodes.filter(n => n.type === 'team' && n.isExpanded).map(n => n.teamId));

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow-conway')
      .attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
      .attr('markerWidth', 14).attr('markerHeight', 14)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => root.attr('transform', e.transform)));

    simNodes  = nodes;
    hullGroup = root.append('g').attr('class', 'ownership-hulls').attr('pointer-events', 'none');

    // ── Links ──────────────────────────────────────────────────────────────

    linkEls = root.append('g')
      .selectAll('path').data(links).join('path')
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-conway)')
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        highlightLink(d);
        onShowLinkTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + 14, e.clientY - 10))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    updateEdgeStyles();

    // ── Nodes ──────────────────────────────────────────────────────────────

    nodeEls = root.append('g')
      .selectAll('g').data(nodes).join('g')
      .style('cursor', d => d.type === 'team' ? 'pointer' : 'grab')
      .call(d3.drag()
        .on('start', (e, d) => {
          d._moved = false;
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (e, d) => { d._moved = true; d.fx = e.x; d.fy = e.y; })
        .on('end',  (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
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
      .attr('x',      d => -(d.r + 14)).attr('y',      d => -d.r)
      .attr('width',  d => (d.r + 14) * 2).attr('height', d => d.r * 2)
      .attr('rx',     d => d.r)
      .attr('fill',   d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 3).attr('opacity', 0.95);

    // Expanded team anchor (dashed border to signal it is the hull origin)
    nodeEls.filter(d => d.type === 'team' && d.isExpanded)
      .append('rect')
      .attr('x',            d => -(d.r + 10)).attr('y',      d => -(d.r * 0.7))
      .attr('width',        d => (d.r + 10) * 2).attr('height', d => d.r * 1.4)
      .attr('rx',           d => d.r * 0.7)
      .attr('fill',         d => d.color)
      .attr('stroke',       '#fff').attr('stroke-width', 2)
      .attr('stroke-dasharray', '5 3').attr('opacity', 0.88);

    // Team label (both states)
    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy',          d => d.isExpanded ? '0.38em' : '-0.15em')
      .attr('fill', '#fff').attr('font-size', d => d.isExpanded ? '11px' : '13px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    // Sub-label on collapsed pill only
    nodeEls.filter(d => d.type === 'team' && !d.isExpanded)
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', '1.1em')
      .attr('fill', 'rgba(255,255,255,0.75)').attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text(d => `${d.repoCount} ${d.repoCount === 1 ? 'repo' : 'repos'} · ${d.authorCount} ${d.authorCount === 1 ? 'dev' : 'devs'}`);

    // Expand / collapse badge
    nodeEls.filter(d => d.type === 'team')
      .append('circle')
      .attr('cx', d => (d.isExpanded ? d.r + 6  : d.r + 10))
      .attr('cy', d => (d.isExpanded ? -(d.r * 0.7) : -d.r))
      .attr('r', 8)
      .attr('fill',   d => d.isExpanded ? '#F08223' : '#22c55e')
      .attr('stroke', '#fff').attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('x', d => (d.isExpanded ? d.r + 6  : d.r + 10))
      .attr('y', d => (d.isExpanded ? -(d.r * 0.7) : -d.r))
      .attr('text-anchor', 'middle').attr('dy', '0.38em')
      .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.isExpanded ? '−' : '+');

    // Bounded context squares
    nodeEls.filter(d => d.type === 'repo')
      .append('rect')
      .attr('x',      d => -d.r).attr('y',      d => -d.r)
      .attr('width',  d => d.r * 2).attr('height', d => d.r * 2)
      .attr('rx', 4)
      .attr('fill',   d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

    // Bounded context label
    nodeEls.filter(d => d.type === 'repo')
      .append('text')
      .attr('text-anchor', 'middle').attr('dy', d => d.r + 13)
      .attr('fill', '#374151').attr('font-size', '11px').attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => d.id);

    // Initial rings
    drawRings();

    // ── Force simulation ───────────────────────────────────────────────────

    const R = Math.min(w, h) * cfg.ringScale + nodes.length * cfg.nodeSpacing;

    function teamGravity(alpha) {
      if (cfg.teamGravity === 0) return;
      const k = cfg.teamGravity * alpha * 1.8;

      const anchorPos = {};
      for (const n of nodes) {
        if (n.type === 'team' && n.isExpanded && n.x != null)
          anchorPos[n.teamId] = { x: n.x, y: n.y };
      }

      for (const n of nodes) {
        if (n.type !== 'repo' || !n.owningTeamId || n.x == null) continue;
        const a = anchorPos[n.owningTeamId];
        if (!a) continue;
        n.vx = (n.vx ?? 0) + (a.x - n.x) * k;
        n.vy = (n.vy ?? 0) + (a.y - n.y) * k;
      }
    }

    // Push repo nodes away from team anchors they don't belong to.
    // This prevents one team's repos from drifting inside another team's hull.
    function crossTeamRepulsion(alpha) {
      const teamAnchors = nodes.filter(n => n.type === 'team' && n.x != null);

      for (const n of nodes) {
        if (n.type !== 'repo' || n.x == null) continue;

        for (const t of teamAnchors) {
          if (t.teamId === n.owningTeamId) continue;

          const dx = n.x - t.x;
          const dy = n.y - t.y;
          const distSq = Math.max(dx * dx + dy * dy, 1);
          const dist   = Math.sqrt(distSq);

          // Inverse-square repulsion, strength proportional to both node sizes
          const force = (8000 * (n.r + t.r) * alpha) / distSq;
          n.vx = (n.vx ?? 0) + (dx / dist) * force;
          n.vy = (n.vy ?? 0) + (dy / dist) * force;
        }
      }
    }

    sim = d3.forceSimulation(nodes)
      .force('link',   d3.forceLink(links).id(d => d.id)
        .distance(d => d.target.type === 'repo' ? cfg.linkDistance : cfg.teamLinkDistance)
        .strength(cfg.linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(d => d.type === 'team' ? cfg.teamCharge : cfg.charge))
      .force('center', d3.forceCenter(w / 2, h / 2).strength(0.08))
      .force('radial', d3.forceRadial(
        d => d.type === 'team' ? R : R * 0.45,
        w / 2, h / 2
      ).strength(d => {
        if (d.type === 'team') return cfg.radialStrength;
        // Repos inside an expanded team are pulled by gravity; minimal radial pull.
        return expandedSet.has(d.owningTeamId) ? 0.02 : cfg.radialStrength * 0.4;
      }))
      .force('collide', d3.forceCollide(
        d => d.r + (d.type === 'team' ? cfg.teamCollide : cfg.collide)
      ))
      .force('teamGravity',       teamGravity)
      .force('crossTeamRepulsion', crossTeamRepulsion);

    sim.on('tick', () => {
      nodes.forEach(n => { if (n.x != null) savedPositions[n.id] = { x: n.x, y: n.y }; });

      linkEls.each(function(d) {
        const dx  = d.target.x - d.source.x;
        const dy  = d.target.y - d.source.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux  = dx / len, uy = dy / len;

        // Source offset — always a team pill
        const { hw: sHW, hh: sHH } = pillHalfDims(d.source);
        const srcOff = squareEdgeDist(ux, uy, sHW, sHH) + 3;

        // Target offset — team pill or repo square
        let tgtOff;
        if (d.target.type === 'team') {
          const { hw: tHW, hh: tHH } = pillHalfDims(d.target);
          tgtOff = squareEdgeDist(ux, uy, tHW, tHH) + 3;
        } else {
          tgtOff = squareEdgeDist(ux, uy, d.target.r, d.target.r) + 2;
        }

        const x1 = d.source.x + ux * srcOff;
        const y1 = d.source.y + uy * srcOff;
        const x2 = d.target.x - ux * tgtOff;
        const y2 = d.target.y - uy * tgtOff;
        d3.select(this).attr('d', `M${x1},${y1} L${x2},${y2}`);
      });

      nodeEls.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      drawHulls();
    });
  }

  // ── Teardown ──────────────────────────────────────────────────────────────

  function teardown() {
    if (sim) { sim.stop(); sim = null; }
    nodeEls   = null;
    linkEls   = null;
    hullGroup = null;
    simNodes  = null;
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
