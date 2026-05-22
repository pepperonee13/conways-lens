import * as d3 from 'd3';

/**
 * Conway's Law violation renderer — Swimlane Layout.
 *
 * Each team is a horizontal lane. The left column is a team label/anchor
 * (with name, repo/dev count, total commits, and violation count badge).
 * The right column packs the team's repos in a wrap-grid; lane height
 * grows to fit. Lanes are ordered by violation severity descending so
 * the architect's eye lands on problem areas first.
 *
 * Cross-team contribution edges originate at the source team's left
 * anchor and target a repo in a different lane. Every such edge crosses
 * at least one horizontal lane boundary — that's the violation signal.
 */
export function useSwimlaneGraph({
  svgRef,
  effectiveTeams,
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

  // Layout constants
  const LANE_LABEL_W = 210;
  const LANE_GAP     = 4;
  const LANE_PAD_Y   = 18;
  const REPO_SIZE    = 20;       // half-width — node spans (REPO_SIZE * 2) px
  const RING_PAD     = 12;       // extra space around node for violation ring + label
  const REPO_SLOT_W  = 100;      // wider than node so labels don't collide
  const REPO_SLOT_H  = REPO_SIZE * 2 + RING_PAD * 2 + 18; // room for label below
  const MIN_LANE_H   = REPO_SLOT_H + LANE_PAD_Y * 2;

  let nodeEls = null;
  let linkEls = null;

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

      const innerR = d.r + 3, outerR = d.r + 8;
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

  function edgeMeetsThreshold(d) {
    const total = d.target?.commits || 0;
    if (!total) return false;
    return (d.commits / total) * 100 >= violationThreshold.value;
  }

  function updateEdgeVisibility() {
    if (!linkEls) return;
    linkEls.attr('display', d => edgeMeetsThreshold(d) ? null : 'none');
  }

  function drawOverlays() { drawRings(); updateEdgeVisibility(); }

  // ── Layout ────────────────────────────────────────────────────────────────

  // Compute violation severity per team: total cross-team commits to repos this team owns,
  // plus total cross-team commits this team makes to others.
  function severityFor(teamId, data) {
    let inbound = 0, outbound = 0;
    for (const repo of data.nodes.filter(n => n.type === 'repo' && n.owningTeamId === teamId)) {
      for (const c of (repo.contributions ?? [])) {
        if (c.teamId !== teamId) inbound += c.commits;
      }
    }
    for (const l of data.links) {
      const srcTid = String(l.source).startsWith('team:') ? String(l.source).slice(5) : null;
      if (srcTid === teamId) outbound += l.commits;
    }
    return inbound + outbound;
  }

  // Lay out lanes vertically; each lane has a left team anchor and a wrap-grid of repos.
  function computeLayout(dims, data) {
    const W = dims.w;
    const teams = effectiveTeams.value;
    if (!teams.length) return { positions: {}, lanes: [], totalH: 0, gridLeft: LANE_LABEL_W };

    // Repos grouped by owningTeamId
    const reposByTeam = {};
    for (const n of data.nodes) {
      if (n.type !== 'repo') continue;
      const tid = n.owningTeamId ?? '__unowned__';
      (reposByTeam[tid] ??= []).push(n);
    }
    // Sort repos within a lane by commit count desc (so heavy hitters land top-left).
    for (const tid in reposByTeam) {
      reposByTeam[tid].sort((a, b) => (b.commits ?? 0) - (a.commits ?? 0));
    }

    // Order teams by violation severity desc (ties → preserve original order).
    const severities = new Map(teams.map(t => [t.id, severityFor(t.id, data)]));
    const ordered = [...teams].sort((a, b) => (severities.get(b.id) - severities.get(a.id)));

    const gridLeft = LANE_LABEL_W;
    const usableW  = Math.max(REPO_SLOT_W, W - gridLeft - 24);
    const cols     = Math.max(1, Math.floor(usableW / REPO_SLOT_W));

    const positions = {};
    const lanes     = [];
    let y = 0;

    for (const team of ordered) {
      const repos = reposByTeam[team.id] ?? [];
      const rows  = Math.max(1, Math.ceil(repos.length / cols));
      const laneH = Math.max(MIN_LANE_H, rows * REPO_SLOT_H + LANE_PAD_Y * 2);

      // Team anchor sits centered vertically on left.
      positions[`team:${team.id}`] = {
        x: LANE_LABEL_W / 2,
        y: y + laneH / 2,
      };

      // Pack repos in grid inside the lane.
      repos.forEach((r, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        positions[r.id] = {
          x: gridLeft + 12 + col * REPO_SLOT_W + REPO_SLOT_W / 2,
          y: y + LANE_PAD_Y + row * REPO_SLOT_H + REPO_SLOT_W / 2,
        };
      });

      lanes.push({
        team, y, h: laneH, repoCount: repos.length,
        violationCount: severities.get(team.id) ?? 0,
      });
      y += laneH + LANE_GAP;
    }

    return { positions, lanes, totalH: y, gridLeft };
  }

  // ── Edge path ─────────────────────────────────────────────────────────────

  function edgePath(d) {
    if (!d.source || !d.target) return '';
    const sx = d.source.x, sy = d.source.y;
    const tx = d.target.x, ty = d.target.y;
    // Team anchor source → bow the edge a little so siblings don't all overlap.
    const dx = tx - sx, dy = ty - sy;
    // Endpoint offsets: clear the source anchor (rectangular) and the target ring.
    const srcOff = 14; // anchor right edge approximation
    const tgtR = d.target.r + 10;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx / len, uy = dy / len;
    const x1 = sx + ux * srcOff;
    const y1 = sy + uy * srcOff;
    const x2 = tx - ux * tgtR;
    const y2 = ty - uy * tgtR;
    // Control point bows slightly to the right of the midpoint so multiple
    // edges from the same anchor fan out instead of overlapping.
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const bow = Math.min(40, Math.abs(dy) * 0.15 + 12);
    return `M${x1},${y1} Q${mx + bow},${my} ${x2},${y2}`;
  }

  // ── Lane backgrounds ──────────────────────────────────────────────────────

  function drawLanes(root, lanes, W) {
    const g = root.append('g').attr('class', 'lanes').attr('pointer-events', 'none');
    lanes.forEach(({ team, y, h, repoCount, violationCount }, i) => {
      // Lane background
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', W).attr('height', h)
        .attr('fill', team.color + '0E');

      // Lane divider (top)
      if (i > 0) {
        g.append('line')
          .attr('x1', 0).attr('y1', y).attr('x2', W).attr('y2', y)
          .attr('stroke', '#e2e8f0').attr('stroke-width', 1);
      }

      // Vertical separator between label column and repo grid
      g.append('line')
        .attr('x1', LANE_LABEL_W).attr('y1', y)
        .attr('x2', LANE_LABEL_W).attr('y2', y + h)
        .attr('stroke', '#e2e8f0').attr('stroke-width', 1);
    });

    // Bottom border
    if (lanes.length) {
      const last = lanes[lanes.length - 1];
      g.append('line')
        .attr('x1', 0).attr('y1', last.y + last.h)
        .attr('x2', W).attr('y2', last.y + last.h)
        .attr('stroke', '#e2e8f0').attr('stroke-width', 1);
    }
  }

  // ── Full draw ─────────────────────────────────────────────────────────────

  function draw({ dims, data }) {
    if (!svgRef.value || !data.nodes.length) return;

    const W = dims.w;
    const { positions, lanes, totalH } = computeLayout(dims, data);
    const H = Math.max(dims.h, totalH);

    // Node sizing: repos by commits, team anchors fixed.
    const repoMax = d3.max(data.nodes.filter(n => n.type === 'repo'), n => n.commits) || 1;
    const repoScale = d3.scaleSqrt().domain([0, repoMax]).range([12, REPO_SIZE]);

    const nodes = data.nodes
      .filter(n => positions[n.id])
      .map(n => ({
        ...n,
        r: n.type === 'team' ? 20 : repoScale(n.commits || 1),
        x: positions[n.id].x,
        y: positions[n.id].y,
      }));

    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = data.links.map(l => ({
      ...l,
      source: nodeById[typeof l.source === 'object' ? l.source.id : l.source],
      target: nodeById[typeof l.target === 'object' ? l.target.id : l.target],
    })).filter(l => l.source && l.target);

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow-swim')
      .attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
      .attr('markerWidth', 12).attr('markerHeight', 12)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on('zoom', e => root.attr('transform', e.transform)));

    drawLanes(root, lanes, W);

    // Edges (drawn after lanes, before nodes)
    linkEls = root.append('g')
      .selectAll('path').data(links).join('path')
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-swim)')
      .attr('d', d => edgePath(d))
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        highlightLink(d);
        onShowLinkTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + 14, e.clientY - 10))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    updateEdgeStyles();
    updateEdgeVisibility();

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

    // Team anchor: pill with name + sublabel
    const teamG = nodeEls.filter(d => d.type === 'team');
    teamG.append('rect')
      .attr('x', -90).attr('y', -22)
      .attr('width', 180).attr('height', 44)
      .attr('rx', 10)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .attr('opacity', 0.95);

    teamG.append('text')
      .attr('text-anchor', 'middle').attr('dy', '-0.2em')
      .attr('fill', '#fff').attr('font-size', '12px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    teamG.append('text')
      .attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('fill', 'rgba(255,255,255,0.82)').attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text(d => `${d.repoCount} ${d.repoCount === 1 ? 'repo' : 'repos'} · ${d.authorCount} ${d.authorCount === 1 ? 'dev' : 'devs'} · ${(d.commits || 0).toLocaleString()} commits`);

    // Repo squares: white fill, team-colored border
    const repoG = nodeEls.filter(d => d.type === 'repo');
    repoG.append('rect')
      .attr('class', 'repo-fill')
      .attr('x', d => -d.r).attr('y', d => -d.r)
      .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
      .attr('rx', 4)
      .attr('fill', '#ffffff')
      .attr('stroke', d => d.color || '#9CA3AF').attr('stroke-width', 2.5);

    repoG.append('text')
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
