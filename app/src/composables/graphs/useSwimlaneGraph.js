import * as d3 from 'd3';
import { EDGE, NODE, ARROW, TOOLTIP_OFFSET, VIOLATION_ARC } from './graphConstants.js';
import { calcEdgeWidth } from './graphUtils.js';

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
  onNodeClick,
  edgeWeight,
  violationThreshold,
  violatingOnly,
}) {
  // Swimlane-specific layout constants
  const LANE_LABEL_W = 210;
  const LANE_GAP     = 4;
  const LANE_PAD_Y   = 18;
  const REPO_SIZE    = 20;       // half-width — node spans (REPO_SIZE * 2) px
  const RING_PAD     = 12;       // extra space around node for violation ring + label
  const REPO_SLOT_W  = 140;      // wider than node to fit full repo-name labels
  const REPO_SLOT_H  = REPO_SIZE * 2 + RING_PAD * 2 + 18; // room for label below
  const MIN_LANE_H   = REPO_SLOT_H + LANE_PAD_Y * 2;

  let nodeEls = null;
  let linkEls = null;

  // ── Edge styling ──────────────────────────────────────────────────────────

  function edgeStroke(d) {
    return edgeWeight.value ? (d.source?.color ?? EDGE.COLOR) : EDGE.COLOR;
  }

  function edgeWidth(d) {
    return calcEdgeWidth(d.commits, edgeWeight.value);
  }

  function updateEdgeStyles() {
    if (!linkEls) return;
    linkEls
      .attr('stroke',       d => edgeStroke(d))
      .attr('stroke-width', d => edgeWidth(d))
      .attr('display',      'none')
      .attr('opacity',      EDGE.HL_OPACITY);
  }

  function updateNodeColors() {
    if (!nodeEls) return;
    nodeEls.filter(d => d.type === 'repo').select('circle.repo-fill')
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
    linkEls
      .attr('stroke',   l => (l.source.id === d.id || l.target.id === d.id) ? (l.source?.color ?? EDGE.HL_COLOR) : edgeStroke(l))
      .attr('display',  l => (l.source.id === d.id || l.target.id === d.id) && edgeMeetsThreshold(l) ? null : 'none')
      .attr('opacity',  EDGE.HL_OPACITY);
  }

  function highlightLink(d) {
    if (!nodeEls || !linkEls) return;
    linkEls
      .attr('stroke',  l => l === d ? (l.source?.color ?? EDGE.HL_COLOR) : edgeStroke(l))
      .attr('display', l => l === d ? null : 'none')
      .attr('opacity', EDGE.HL_OPACITY);
  }

  function resetHighlight() {
    if (!linkEls) return;
    updateEdgeStyles();
    updateEdgeVisibility();
  }

  // ── Violation rings ───────────────────────────────────────────────────────

  function drawRings() {
    if (!nodeEls) return;
    const threshold = violationThreshold.value;
    const arcGen = d3.arc();

    nodeEls.filter(d => d.type === 'repo').each(function(d) {
      const node = d3.select(this);
      node.selectAll('.violation-arc').remove();
      if (!d.contributions || d.commits === 0) return;

      // Above-threshold outside teams render as their own arcs.
      // Owner share absorbs both its real commits and any below-threshold
      // outside contributions, so the ring always closes into a full circle.
      const above = [];
      let ownerCommits = 0;
      for (const c of d.contributions) {
        if (c.teamId === d.owningTeamId) {
          ownerCommits += c.commits;
        } else if ((c.commits / d.commits) * 100 >= threshold) {
          above.push(c);
        } else {
          ownerCommits += c.commits;
        }
      }

      const innerR = d.r + VIOLATION_ARC.INNER_PAD, outerR = d.r + VIOLATION_ARC.OUTER_PAD;
      let startAngle = -Math.PI / 2;

      const ownerColor = d.color || '#9CA3AF';
      if (ownerCommits > 0) {
        const endAngle = startAngle + (ownerCommits / d.commits) * 2 * Math.PI;
        node.append('path')
          .attr('class', 'violation-arc')
          .attr('d', arcGen({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle }))
          .attr('fill', ownerColor).attr('opacity', 0.95)
          .attr('pointer-events', 'none');
        startAngle = endAngle;
      }
      for (const c of above) {
        const endAngle = startAngle + (c.commits / d.commits) * 2 * Math.PI;
        node.append('path')
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
    linkEls.filter(d => !edgeMeetsThreshold(d)).attr('display', 'none');
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
    const threshold = violationThreshold.value;
    const onlyViolating = !!violatingOnly?.value;
    const isViolating = (repo) => {
      if (!repo.contributions || !repo.commits) return false;
      return repo.contributions.some(c =>
        c.teamId !== repo.owningTeamId && (c.commits / repo.commits) * 100 >= threshold
      );
    };

    const reposByTeam = {};
    for (const n of data.nodes) {
      if (n.type !== 'repo') continue;
      if (onlyViolating && !isViolating(n)) continue;
      const tid = n.owningTeamId ?? '__unowned__';
      (reposByTeam[tid] ??= []).push(n);
    }
    // Sort repos within a lane by commit count desc (so heavy hitters land top-left).
    for (const tid in reposByTeam) {
      reposByTeam[tid].sort((a, b) => (b.commits ?? 0) - (a.commits ?? 0));
    }

    // A team is shown only if it has at least one violation — meaning at least
    // one cross-team edge (incoming: another team committed to a repo it owns,
    // or outgoing: one of its members committed to another team's repo).
    const severities = new Map(teams.map(t => [t.id, severityFor(t.id, data)]));
    const ordered = [...teams]
      .filter(t => (severities.get(t.id) ?? 0) > 0)
      .sort((a, b) => (severities.get(b.id) - severities.get(a.id)));

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
          y: y + LANE_PAD_Y + row * REPO_SLOT_H + REPO_SLOT_H / 2,
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
    const tgtR = d.target.r + VIOLATION_ARC.OUTER_PAD + ARROW.REF_X;
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
      .attr('viewBox', ARROW.VIEWBOX).attr('refX', 0).attr('refY', ARROW.REF_Y)
      .attr('markerWidth', ARROW.SIZE).attr('markerHeight', ARROW.SIZE)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.4, 4]).on('zoom', e => root.attr('transform', e.transform));
    svg.call(zoom);
    // Shift content right so the team-anchor tooltip (which opens left of cursor) stays in viewport.
    zoom.transform(svg, d3.zoomIdentity.translate(180, 0));

    svg.append('text').attr('x', 12).attr('y', 20)
      .attr('fill', '#94a3b8').attr('font-size', '11px').attr('font-weight', '600')
      .attr('pointer-events', 'none').text('Conway / Swimlane');

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
        onShowLinkTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    updateEdgeStyles();
    updateEdgeVisibility();

    // Nodes
    nodeEls = root.append('g')
      .selectAll('g').data(nodes).join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', d => (onNodeClick && d.type === 'repo') ? 'pointer' : 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        if (d.type === 'team') {
          onShowNodeTooltip(d, e.clientX, e.clientY + 14);
        } else {
          onShowNodeTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y);
        }
      })
      .on('mousemove', (e, d) => {
        if (d.type === 'team') {
          onMoveTooltip(e.clientX, e.clientY + 14);
        } else {
          onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y);
        }
      })
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); })
      .on('click', (e, d) => { if (onNodeClick && d.type === 'repo') { onHideTooltip(); onNodeClick(d); } });

    // Team anchor: pill with name + sublabel
    const teamG = nodeEls.filter(d => d.type === 'team');
    teamG.append('rect')
      .attr('x', -90).attr('y', -22)
      .attr('width', 180).attr('height', 44)
      .attr('rx', 10)
      .attr('fill', d => d.color)
      .attr('stroke', NODE.STROKE).attr('stroke-width', 2)
      .attr('opacity', NODE.OPACITY_TEAM);

    teamG.append('text')
      .attr('text-anchor', 'middle').attr('dy', '-0.2em')
      .attr('fill', NODE.STROKE).attr('font-size', '12px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    teamG.append('text')
      .attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('fill', 'rgba(255,255,255,0.82)').attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text(d => `${d.repoCount} ${d.repoCount === 1 ? 'repo' : 'repos'} · ${d.authorCount} ${d.authorCount === 1 ? 'dev' : 'devs'} · ${(d.commits || 0).toLocaleString()} commits`);

    // Repo circles filled with owner team color (softened so the ring pops)
    const repoG = nodeEls.filter(d => d.type === 'repo');
    repoG.append('circle')
      .attr('class', 'repo-fill')
      .attr('r', d => d.r)
      .attr('fill', d => d.color || '#9CA3AF')
      .attr('fill-opacity', 0.45)
      .attr('stroke', NODE.STROKE).attr('stroke-width', EDGE.WIDTH);

    repoG.append('text')
      .attr('text-anchor', 'middle').attr('dy', d => d.r + VIOLATION_ARC.OUTER_PAD + 13)
      .attr('fill', NODE.LABEL_COLOR).attr('font-size', NODE.LABEL_SIZE_SM).attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => d.id);

    drawRings();
  }

  function teardown() {
    nodeEls = null;
    linkEls = null;
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
