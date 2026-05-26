import * as d3 from 'd3';
import { EDGE, NODE, ARROW, TOOLTIP_OFFSET, NODE_LABEL_OFFSET, REPO_DETAIL } from './graphConstants.js';
import { calcEdgeWidth, toPct } from './graphUtils.js';

/**
 * Radial repo-detail graph: one repo at center, contributing authors around it.
 * Authors are grouped into team arcs. Teams start collapsed (one node per team);
 * clicking a team node expands it to show individual authors.
 */
export function useRepoDetailGraph({
  svgRef,
  effectiveTeams,
  getNodeColor,
  anonMap,
  onShowNodeTooltip,
  onShowLinkTooltip,
  onMoveTooltip,
  onHideTooltip,
  edgeWeight,
  violationThreshold,
}) {
  let nodeEls = null;
  let linkEls = null;
  let linkLabelEls = null;

  const expandedTeams = new Set();
  let lastDrawArgs = null;
  let zoomBehavior = null;
  let savedTransform = null;

  function edgeStroke(d) {
    return d.authorColor ?? EDGE.COLOR;
  }

  function edgeWidth(d) {
    return calcEdgeWidth(d.commits, edgeWeight.value);
  }

  function updateEdgeStyles() {
    if (!linkEls) return;
    linkEls
      .attr('stroke',       d => edgeStroke(d))
      .attr('stroke-width', d => edgeWidth(d))
      .attr('display',      null)
      .attr('opacity',      EDGE.HL_OPACITY);
    if (linkLabelEls) linkLabelEls.attr('display', null);
  }

  function highlightNode(d) {
    if (!linkEls) return;
    linkEls
      .attr('stroke',  l => l.nodeId === d.id ? (l.authorColor ?? EDGE.HL_COLOR) : edgeStroke(l))
      .attr('display', l => l.nodeId === d.id ? null : 'none')
      .attr('opacity', EDGE.HL_OPACITY);
    if (linkLabelEls) linkLabelEls.attr('display', l => l.nodeId === d.id ? null : 'none');
    if (linkLabelEls) linkLabelEls.filter(l => l.nodeId === d.id).raise();
  }

  function resetHighlight() {
    updateEdgeStyles();
  }

  function draw({ dims, data }) {
    if (!svgRef.value) return;
    lastDrawArgs = { dims, data };

    const { w, h } = dims;
    const cx = w / 2, cy = h / 2;
    const { REPO_R, AUTHOR_R_MIN, AUTHOR_R_MAX, EDGE_REPO_GAP,
            ARC_SLOT_MAX, ARC_SLOT_MIN, ARC_FILL_FRAC,
            PILL_W, PILL_H, PILL_RX, BLUR_STD } = REPO_DETAIL;

    // ── Helpers ──────────────────────────────────────────────────────────────


    // Split name into ≤2 lines at a word boundary, ~13 chars per line
    function pillLines(name) {
      if (name.length <= 13) return [name];
      const mid = Math.ceil(name.length / 2);
      const spaceAfter  = name.indexOf(' ', mid - 4);
      const spaceBefore = name.lastIndexOf(' ', mid + 4);
      const split = spaceAfter !== -1 ? spaceAfter : spaceBefore !== -1 ? spaceBefore : mid;
      return [name.slice(0, split).trim(), name.slice(split).trim()];
    }

    function drawPillRect(sel, colorFn) {
      sel.append('rect')
        .attr('x', -PILL_W / 2).attr('y', -PILL_H / 2)
        .attr('width', PILL_W).attr('height', PILL_H)
        .attr('rx', PILL_RX)
        .attr('fill', colorFn)
        .attr('fill-opacity', NODE.OPACITY_TEAM)
        .attr('stroke', NODE.STROKE)
        .attr('stroke-width', 2);
    }

    function drawPillLabel(sel, name, sublabel) {
      const lines  = pillLines(name);
      const nameY  = lines.length === 1 ? '-0.2em' : '-0.8em';
      const subDy  = lines.length === 1 ? '1em' : '2.2em';
      const nameEl = sel.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', NODE.STROKE).attr('font-size', '12px').attr('font-weight', '700')
        .attr('pointer-events', 'none');
      lines.forEach((line, i) => {
        nameEl.append('tspan').attr('x', 0).attr('dy', i === 0 ? nameY : '1.1em').text(line);
      });
      sel.append('text')
        .attr('text-anchor', 'middle').attr('dy', subDy)
        .attr('fill', 'rgba(255,255,255,0.82)').attr('font-size', '9px')
        .attr('pointer-events', 'none')
        .text(sublabel);
    }

    // ── Data preparation ─────────────────────────────────────────────────────

    const teams = effectiveTeams.value;
    const authorTeam = {};
    // First assignment wins — must match the store's authorToTeamId logic so
    // contribution percentages line up between the swimlane and detail views.
    for (const t of teams) {
      for (const a of (t.authors ?? [])) {
        if (!(a in authorTeam)) authorTeam[a] = t;
      }
    }

    const teamGroups = {};
    const unassigned = [];
    for (const node of data.nodes.filter(n => n.type === 'author')) {
      const t = authorTeam[node.id];
      if (t) (teamGroups[t.id] ??= { team: t, authors: [] }).authors.push(node);
      else    unassigned.push(node);
    }

    const repoNode  = data.nodes.find(n => n.type === 'repo');
    const repoTotal = repoNode?.commits || 1;

    // Pre-compute commit totals per team (used for threshold + owning team)
    for (const g of Object.values(teamGroups)) {
      g.totalCommits = g.authors.reduce((s, a) => s + (a.commits ?? 0), 0);
    }

    // Prefer the configured owning team (from team mappings). Fall back to the
    // top contributor when the repo isn't assigned to any team.
    const repoOwningTeamId = repoNode?.owningTeamId
      ?? Object.values(teamGroups).sort((a, b) => b.totalCommits - a.totalCommits)[0]?.team.id
      ?? null;

    const threshold = violationThreshold?.value ?? 0;
    const groups = Object.values(teamGroups).filter(g =>
      g.team.id === repoOwningTeamId || (g.totalCommits / repoTotal) * 100 >= threshold
    );
    if (unassigned.length) {
      const uPct = (unassigned.reduce((s, a) => s + (a.commits ?? 0), 0) / repoTotal) * 100;
      if (uPct >= threshold) groups.push({ team: null, authors: unassigned, totalCommits: uPct * repoTotal / 100 });
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    const totalAuthors = groups.reduce((s, g) => s + g.authors.length, 0);
    const R = Math.min(w, h) * 0.36 + totalAuthors * 3;

    const totalSlots  = groups.reduce((s, g) =>
      s + (g.team && !expandedTeams.has(g.team.id) ? 1 : g.authors.length), 0);
    const arcPerSlot  = Math.min(
      (2 * Math.PI) / ARC_SLOT_MAX,
      Math.max((2 * Math.PI) / ARC_SLOT_MIN, (2 * Math.PI * ARC_FILL_FRAC) / Math.max(totalSlots, 1))
    );
    const usedArc = arcPerSlot * totalSlots;
    const gapArc  = groups.length > 1 ? (2 * Math.PI - usedArc) / groups.length : 0;

    const positions = {};
    let angle = -Math.PI / 2;
    const ringNodes = [];
    const groupArcMid = new Map(); // team.id → midAngle of that group's arc

    for (const g of groups) {
      const collapsed = g.team && !expandedTeams.has(g.team.id);
      if (collapsed) {
        const theta  = angle + arcPerSlot * 0.5;
        const nodeId = `team-collapsed:${g.team.id}`;
        positions[nodeId] = {
          x: cx + Math.cos(theta) * R,
          y: cy + Math.sin(theta) * R,
          color: g.team.color,
          teamName: g.team.name,
        };
        if (g.team) groupArcMid.set(g.team.id, theta);
        ringNodes.push({
          id: nodeId, type: 'team-collapsed',
          commits: g.totalCommits,
          pct: toPct(g.totalCommits, repoTotal),
          color: g.team.color, teamName: g.team.name,
          team: g.team, authors: g.authors,
        });
        angle += arcPerSlot + gapArc;
      } else {
        g.authors.sort((a, b) => b.commits - a.commits);
        const arcStart = angle;
        for (let i = 0; i < g.authors.length; i++) {
          const a     = g.authors[i];
          const theta = angle + arcPerSlot * (i + 0.5);
          positions[a.id] = {
            x: cx + Math.cos(theta) * R,
            y: cy + Math.sin(theta) * R,
            color: g.team?.color ?? '#9CA3AF',
            teamName: g.team?.name ?? 'Unassigned',
          };
          ringNodes.push({
            id: a.id, type: 'author',
            commits: a.commits,
            pct: toPct(a.commits, repoTotal),
            color: g.team?.color ?? '#9CA3AF',
            teamName: g.team?.name ?? 'Unassigned',
          });
        }
        const arcEnd = angle + arcPerSlot * g.authors.length;
        if (g.team) groupArcMid.set(g.team.id, (arcStart + arcEnd) / 2);
        angle = arcEnd + gapArc;
      }
    }

    // ── Links ────────────────────────────────────────────────────────────────

    const links = [];
    for (const g of groups) {
      const collapsed = g.team && !expandedTeams.has(g.team.id);
      if (collapsed) {
        const nodeId = `team-collapsed:${g.team.id}`;
        links.push({
          nodeId, authorId: nodeId,
          authorColor: g.team.color,
          commits: g.totalCommits,
          pct: toPct(g.totalCommits, repoTotal),
          source: nodeId, target: repoNode?.id,
        });
      } else {
        for (const l of data.links) {
          const authorId = typeof l.source === 'object' ? l.source.id : l.source;
          if (!positions[authorId]) continue;
          if (g.team  && authorTeam[authorId]?.id !== g.team.id) continue;
          if (!g.team && authorTeam[authorId]) continue;
          links.push({
            ...l, nodeId: authorId, authorId,
            authorColor: positions[authorId]?.color,
            pct: toPct(l.commits, repoTotal),
          });
        }
      }
    }

    // ── SVG setup ────────────────────────────────────────────────────────────

    const svg = d3.select(svgRef.value);
    // Capture current transform before wiping so expand/collapse preserves pan+zoom
    if (zoomBehavior) savedTransform = d3.zoomTransform(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow-detail')
      .attr('viewBox', ARROW.VIEWBOX).attr('refX', 0).attr('refY', ARROW.REF_Y)
      .attr('markerWidth', ARROW.SIZE).attr('markerHeight', ARROW.SIZE)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    for (const t of teams) {
      const f = defs.append('filter').attr('id', `blur-aura-detail-${t.id}`)
        .attr('x', '-60%').attr('y', '-60%').attr('width', '320%').attr('height', '320%');
      f.append('feGaussianBlur').attr('stdDeviation', BLUR_STD);
    }

    const root = svg.append('g');
    zoomBehavior = d3.zoom().scaleExtent([0.4, 4]).on('zoom', e => root.attr('transform', e.transform));
    svg.call(zoomBehavior);
    if (savedTransform) {
      svg.call(zoomBehavior.transform, savedTransform);
    }

    // ── Edge endpoint helper ─────────────────────────────────────────────────

    function edgeEnd(nodeId) {
      const pos = positions[nodeId];
      if (!pos) return { lx2: cx, ly2: cy };
      const dx = cx - pos.x, dy = cy - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const stop = REPO_R + EDGE_REPO_GAP;
      return { lx2: cx - ux * stop, ly2: cy - uy * stop };
    }

    // ── Hull auras ───────────────────────────────────────────────────────────

    const rScale = d3.scaleSqrt().domain([0, d3.max(ringNodes, d => d.commits) || 1]).range([AUTHOR_R_MIN, AUTHOR_R_MAX]);
    const smoothCurve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));

    function teamHullPath(pts, padding) {
      const samples = [];
      for (const [x, y, r] of pts) {
        const rad = (r ?? AUTHOR_R_MIN) + padding;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          samples.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
        }
      }
      const hull = d3.polygonHull(samples);
      return hull ? smoothCurve(hull) : null;
    }

    for (const g of groups) {
      if (!g.team || !expandedTeams.has(g.team.id)) continue;
      const pts = [
        [cx, cy, REPO_R],
        ...g.authors.map(a => {
          const pos = positions[a.id];
          return pos ? [pos.x, pos.y, rScale(a.commits)] : null;
        }).filter(Boolean),
      ];
      const path = teamHullPath(pts, 24);
      if (!path) continue;
      const auraGroup = root.append('g').attr('pointer-events', 'none');
      auraGroup.append('path').attr('d', path)
        .attr('fill', g.team.color).attr('opacity', 0.28)
        .attr('filter', `url(#blur-aura-detail-${g.team.id})`);
      auraGroup.append('path').attr('d', path)
        .attr('fill', g.team.color).attr('opacity', 0.07);
    }

    // ── Edges ────────────────────────────────────────────────────────────────

    linkEls = root.append('g')
      .selectAll('line').data(links).join('line')
      .attr('x1', d => positions[d.nodeId]?.x ?? cx)
      .attr('y1', d => positions[d.nodeId]?.y ?? cy)
      .attr('x2', d => edgeEnd(d.nodeId).lx2)
      .attr('y2', d => edgeEnd(d.nodeId).ly2)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-detail)')
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => onShowLinkTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mousemove',  e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    // Edge pct badge (always visible)
    linkLabelEls = root.append('g')
      .selectAll('g').data(links).join('g')
      .attr('transform', d => {
        const pos = positions[d.nodeId];
        if (!pos) return `translate(${cx},${cy})`;
        const end = edgeEnd(d.nodeId);
        return `translate(${(pos.x + end.lx2) / 2},${(pos.y + end.ly2) / 2})`;
      })
      .attr('pointer-events', 'none')
      .each(function(d) {
        const g     = d3.select(this);
        const label = `${d.pct}%`;
        const r     = Math.max(9, label.length * 4.5);
        const fs    = label.length <= 4 ? 10 : 8;
        g.append('circle').attr('r', r).attr('fill', '#fff')
          .attr('stroke', d.authorColor ?? EDGE.HL_COLOR).attr('stroke-width', 2);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
          .attr('fill', d.authorColor ?? EDGE.HL_COLOR)
          .attr('font-size', `${fs}px`).attr('font-weight', '700')
          .text(label);
      });

    updateEdgeStyles();

    // ── Ring nodes ───────────────────────────────────────────────────────────

    nodeEls = root.append('g')
      .selectAll('g').data(ringNodes).join('g')
      .attr('transform', d => { const p = positions[d.id]; return `translate(${p.x},${p.y})`; })
      .style('cursor', d => d.type === 'team-collapsed' ? 'pointer' : 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        const authorContributions = d.type === 'team-collapsed'
          ? d.authors
              .map(a => ({
                authorId: a.id,
                commits: a.commits,
                pct: toPct(a.commits, repoTotal),
                teamColor: d.team?.color ?? null,
              }))
              .sort((a, b) => b.commits - a.commits)
          : null;
        onShowNodeTooltip(
          { ...d, type: d.type === 'team-collapsed' ? 'team-collapsed' : 'author', authorContributions },
          e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y
        );
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); })
      .on('click', (e, d) => {
        if (d.type !== 'team-collapsed') return;
        expandedTeams.add(d.team.id);
        onHideTooltip();
        draw(lastDrawArgs);
      });

    // Collapsed team pill
    drawPillRect(nodeEls.filter(d => d.type === 'team-collapsed'), d => d.color ?? '#9CA3AF');
    nodeEls.filter(d => d.type === 'team-collapsed').each(function(d) {
      drawPillLabel(
        d3.select(this),
        d.teamName,
        `${d.authors.length} ${d.authors.length === 1 ? 'dev' : 'devs'} · ${d.commits.toLocaleString()} commits`
      );
    });

    // Author circle + label
    nodeEls.filter(d => d.type === 'author').append('circle')
      .attr('r', d => rScale(d.commits))
      .attr('fill', d => d.color ?? '#9CA3AF')
      .attr('stroke', NODE.STROKE).attr('stroke-width', NODE.STROKE_WIDTH)
      .attr('opacity', NODE.OPACITY);
    nodeEls.filter(d => d.type === 'author').append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => rScale(d.commits) + NODE_LABEL_OFFSET)
      .attr('fill', NODE.LABEL_COLOR).attr('font-size', NODE.LABEL_SIZE).attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => anonMap.value[d.id] ?? d.id);

    // ── Collapse buttons ─────────────────────────────────────────────────────

    for (const g of groups) {
      if (!g.team || !expandedTeams.has(g.team.id)) continue;
      if (!g.authors.length) continue;
      const midAngle = groupArcMid.get(g.team.id) ?? 0;
      const btnR     = R + AUTHOR_R_MAX + NODE_LABEL_OFFSET + 28;
      const btn      = root.append('g')
        .attr('transform', `translate(${cx + Math.cos(midAngle) * btnR},${cy + Math.sin(midAngle) * btnR})`)
        .style('cursor', 'pointer')
        .on('click', () => { expandedTeams.delete(g.team.id); onHideTooltip(); draw(lastDrawArgs); });
      drawPillRect(btn, g.team.color);
      drawPillLabel(btn, g.team.name, '− collapse');
    }

    // ── Repo node at center ──────────────────────────────────────────────────

    if (repoNode) {
      // Per-team contributions for tooltip
      const teamCommits = {};
      for (const l of data.links) {
        const authorId = typeof l.source === 'object' ? l.source.id : l.source;
        const key = authorTeam[authorId]?.id ?? '__unassigned__';
        teamCommits[key] = (teamCommits[key] ?? 0) + l.commits;
      }
      const repoContributions = Object.entries(teamCommits).map(([teamId, commits]) => ({
        teamId, commits, teamColor: teams.find(t => t.id === teamId)?.color ?? '#9CA3AF',
      }));

      const repoG = root.append('g')
        .attr('transform', `translate(${cx},${cy})`)
        .style('cursor', 'default')
        .on('mouseenter', e => onShowNodeTooltip(
          { id: repoNode.id, type: 'repo', commits: repoNode.commits,
            teamName: '', repoCount: 0, authorCount: 0,
            contributions: repoContributions, owningTeamId: repoOwningTeamId },
          e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y
        ))
        .on('mousemove',  e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
        .on('mouseleave', () => onHideTooltip());

      repoG.append('circle')
        .attr('r', REPO_R)
        .attr('fill', getNodeColor(repoNode.id, 'repo') ?? '#9CA3AF')
        .attr('fill-opacity', 0.45)
        .attr('stroke', NODE.STROKE).attr('stroke-width', EDGE.WIDTH);
      repoG.append('text')
        .attr('text-anchor', 'middle').attr('dy', REPO_R + NODE_LABEL_OFFSET)
        .attr('fill', NODE.LABEL_COLOR).attr('font-size', NODE.LABEL_SIZE_SM).attr('font-weight', '600')
        .attr('pointer-events', 'none')
        .text(repoNode.id);
    }
  }

  function teardown() {
    nodeEls = null;
    linkEls = null;
    linkLabelEls = null;
    expandedTeams.clear();
    lastDrawArgs = null;
    zoomBehavior = null;
    savedTransform = null;
  }

  function updateNodeColors() {}
  function drawOverlays() {}

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
