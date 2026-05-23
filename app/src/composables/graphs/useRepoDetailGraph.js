import * as d3 from 'd3';
import { EDGE, NODE, ARROW, TOOLTIP_OFFSET } from './graphConstants.js';

/**
 * Radial repo-detail graph: one repo at center, contributing authors around it.
 * Authors are grouped into team arcs. Teams start collapsed (one node per team);
 * clicking a team node expands it to show individual authors.
 */
export function useRepoDetailGraph({
  svgRef,
  effectiveTeams,
  getNodeColor,
  anonymize,
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

  // Persists across redraws — teams whose authors are expanded
  const expandedTeams = new Set();

  // Last draw args — needed to redraw on expand/collapse
  let lastDrawArgs = null;

  function edgeStroke(d) {
    return edgeWeight.value ? (d.authorColor ?? EDGE.COLOR) : EDGE.COLOR;
  }

  function edgeWidth(d) {
    return edgeWeight.value ? Math.max(1, 1 + Math.log1p(d.commits) * EDGE.WIDTH_LOG_K) : EDGE.WIDTH;
  }

  function updateEdgeStyles() {
    if (!linkEls) return;
    linkEls
      .attr('stroke',       d => edgeStroke(d))
      .attr('stroke-width', d => edgeWidth(d))
      .attr('display',      null)
      .attr('opacity',      EDGE.HL_OPACITY);
    if (linkLabelEls) linkLabelEls.attr('display', 'none');
  }

  function highlightNode(d) {
    if (!linkEls) return;
    linkEls
      .attr('stroke',  l => l.nodeId === d.id ? (l.authorColor ?? EDGE.HL_COLOR) : edgeStroke(l))
      .attr('display', l => l.nodeId === d.id ? null : 'none')
      .attr('opacity', EDGE.HL_OPACITY);
    if (linkLabelEls) linkLabelEls.attr('display', l => l.nodeId === d.id ? null : 'none');
  }

  function resetHighlight() {
    updateEdgeStyles();
  }

  function draw({ dims, data }) {
    if (!svgRef.value) return;
    lastDrawArgs = { dims, data };

    const { w, h } = dims;
    const cx = w / 2, cy = h / 2;

    const teams = effectiveTeams.value;
    const authorTeam = {};
    for (const t of teams) {
      for (const a of (t.authors ?? [])) authorTeam[a] = t;
    }

    // Group authors by team, then unassigned
    const teamGroups = {};
    const unassigned = [];
    for (const node of data.nodes.filter(n => n.type === 'author')) {
      const t = authorTeam[node.id];
      if (t) {
        (teamGroups[t.id] ??= { team: t, authors: [] }).authors.push(node);
      } else {
        unassigned.push(node);
      }
    }

    const repoNode = data.nodes.find(n => n.type === 'repo');
    const repoTotal = repoNode?.commits || 1;

    // Find owning team (highest commit share) — always shown regardless of threshold
    const teamCommitTotals = {};
    for (const [tid, g] of Object.entries(teamGroups)) {
      teamCommitTotals[tid] = g.authors.reduce((s, a) => s + (a.commits ?? 0), 0);
    }
    const repoOwningTeamId = Object.entries(teamCommitTotals)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Filter groups below threshold (owner always kept)
    const threshold = violationThreshold?.value ?? 0;
    const allGroups = Object.values(teamGroups);
    const filteredGroups = allGroups.filter(g => {
      if (g.team?.id === repoOwningTeamId) return true;
      const commits = teamCommitTotals[g.team?.id] ?? 0;
      return (commits / repoTotal) * 100 >= threshold;
    });

    const groups = filteredGroups;
    if (unassigned.length) {
      const unassignedPct = (unassigned.reduce((s, a) => s + (a.commits ?? 0), 0) / repoTotal) * 100;
      if (unassignedPct >= threshold) groups.push({ team: null, authors: unassigned });
    }

    const totalAuthors = groups.reduce((s, g) => s + g.authors.length, 0);
    const R = Math.min(w, h) * 0.36 + totalAuthors * 3;
    const repoR = 22;

    // Intra-team spacing: fixed angle per author slot, capped so dense teams stay tight
    const MAX_ARC_PER_SLOT = (2 * Math.PI) / 12; // max ~30° per slot
    const MIN_ARC_PER_SLOT = (2 * Math.PI) / 40; // min ~9° per slot

    // Compute slots per group
    const groupSlots = groups.map(g =>
      g.team && !expandedTeams.has(g.team.id) ? 1 : g.authors.length
    );
    const totalSlots = groupSlots.reduce((s, n) => s + n, 0);

    // Choose intra-team arc: tight enough to cluster, but not too cramped
    const arcPerSlot = Math.min(MAX_ARC_PER_SLOT, Math.max(MIN_ARC_PER_SLOT,
      (2 * Math.PI * 0.6) / Math.max(totalSlots, 1)
    ));

    // Remaining arc distributed as gaps between groups
    const usedArc = arcPerSlot * totalSlots;
    const gapArc = groups.length > 1
      ? (2 * Math.PI - usedArc) / groups.length
      : 0;

    // positions keyed by node id (author or team-collapsed)
    const positions = {};
    let angle = -Math.PI / 2;

    // Build ring nodes: either a collapsed team node or individual author nodes
    const ringNodes = []; // { id, type:'author'|'team-collapsed', commits, color, teamName, team?, authors? }

    for (const g of groups) {
      const collapsed = g.team && !expandedTeams.has(g.team.id);
      if (collapsed) {
        const totalCommits = g.authors.reduce((s, a) => s + (a.commits ?? 0), 0);
        const theta = angle + arcPerSlot * 0.5;
        const nodeId = `team-collapsed:${g.team.id}`;
        positions[nodeId] = {
          x: cx + Math.cos(theta) * R,
          y: cy + Math.sin(theta) * R,
          color: g.team.color,
          teamName: g.team.name,
        };
        ringNodes.push({
          id: nodeId,
          type: 'team-collapsed',
          commits: totalCommits,
          color: g.team.color,
          teamName: g.team.name,
          team: g.team,
          authors: g.authors,
        });
        angle += arcPerSlot + gapArc;
      } else {
        g.authors.sort((a, b) => b.commits - a.commits);
        const arcSize = arcPerSlot * g.authors.length;
        for (let i = 0; i < g.authors.length; i++) {
          const a = g.authors[i];
          const theta = angle + arcPerSlot * (i + 0.5);
          positions[a.id] = {
            x: cx + Math.cos(theta) * R,
            y: cy + Math.sin(theta) * R,
            color: g.team?.color ?? '#9CA3AF',
            teamName: g.team?.name ?? 'Unassigned',
          };
          ringNodes.push({
            id: a.id,
            type: 'author',
            commits: a.commits,
            pct: ((a.commits / repoTotal) * 100).toFixed(1).replace(/\.0$/, ''),
            color: g.team?.color ?? '#9CA3AF',
            teamName: g.team?.name ?? 'Unassigned',
          });
        }
        angle += arcSize + gapArc;
      }
    }

    // Build links: collapsed team → aggregated edge; expanded → per-author edges
    const links = [];
    for (const g of groups) {
      const collapsed = g.team && !expandedTeams.has(g.team.id);
      if (collapsed) {
        const nodeId = `team-collapsed:${g.team.id}`;
        const totalCommits = g.authors.reduce((s, a) => s + (a.commits ?? 0), 0);
        const pos = positions[nodeId];
        links.push({
          nodeId,
          authorId: nodeId,
          authorColor: g.team.color,
          commits: totalCommits,
          pct: ((totalCommits / repoTotal) * 100).toFixed(1).replace(/\.0$/, ''),
          source: nodeId,
          target: repoNode?.id,
          _pos: pos,
        });
      } else {
        for (const l of data.links) {
          const authorId = typeof l.source === 'object' ? l.source.id : l.source;
          if (!positions[authorId]) continue;
          // only authors in this group
          if (g.team && authorTeam[authorId]?.id !== g.team.id) continue;
          if (!g.team && authorTeam[authorId]) continue;
          const pos = positions[authorId];
          const pct = ((l.commits / repoTotal) * 100).toFixed(1).replace(/\.0$/, '');
          links.push({ ...l, nodeId: authorId, authorId, authorColor: pos?.color, _pos: pos, pct });
        }
      }
    }
    // Also include unassigned author links (no team)
    // (already handled above via group loop)

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow-detail')
      .attr('viewBox', ARROW.VIEWBOX).attr('refX', 0).attr('refY', ARROW.REF_Y)
      .attr('markerWidth', ARROW.SIZE).attr('markerHeight', ARROW.SIZE)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    // Per-team blur filters for soft hull aura
    for (const t of teams) {
      const f = defs.append('filter').attr('id', `blur-aura-detail-${t.id}`)
        .attr('x', '-60%').attr('y', '-60%')
        .attr('width', '320%').attr('height', '320%');
      f.append('feGaussianBlur').attr('stdDeviation', 22);
    }

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on('zoom', e => root.attr('transform', e.transform)));

    // Helper: compute edge endpoint stopped at repo square boundary
    function edgeEnd(nodeId) {
      const pos = positions[nodeId];
      if (!pos) return { lx2: cx, ly2: cy };
      const dx = cx - pos.x;
      const dy = cy - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const absDx = Math.abs(ux), absDy = Math.abs(uy);
      const squareDist = absDx > absDy ? repoR / absDx : repoR / absDy;
      const stop = squareDist + 30;
      return { lx2: cx - ux * stop, ly2: cy - uy * stop };
    }

    // Hull aura for expanded teams (drawn before edges + nodes)
    const commitMax_ = d3.max(ringNodes, d => d.commits) || 1;
    const rScale_ = d3.scaleSqrt().domain([0, commitMax_]).range([8, 22]);
    const smoothCurve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));

    function teamHullPath(pts, padding) {
      const samples = [];
      for (const [x, y, r] of pts) {
        const rad = (r ?? 14) + padding;
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
        [cx, cy, repoR],
        ...g.authors.map(a => {
          const pos = positions[a.id];
          return pos ? [pos.x, pos.y, rScale_(a.commits)] : null;
        }).filter(Boolean),
      ];
      if (pts.length < 1) continue;
      const path = teamHullPath(pts, 24);
      if (!path) continue;
      const auraGroup = root.append('g').attr('pointer-events', 'none');
      // Blurred aura layer — soft glow around the hull shape
      auraGroup.append('path').attr('d', path)
        .attr('fill', g.team.color)
        .attr('opacity', 0.28)
        .attr('filter', `url(#blur-aura-detail-${g.team.id})`);
      // Crisp inner fill — very faint, no stroke
      auraGroup.append('path').attr('d', path)
        .attr('fill', g.team.color)
        .attr('opacity', 0.07);
    }

    // Edges
    linkEls = root.append('g')
      .selectAll('line').data(links).join('line')
      .attr('x1', d => positions[d.nodeId]?.x ?? cx)
      .attr('y1', d => positions[d.nodeId]?.y ?? cy)
      .attr('x2', d => edgeEnd(d.nodeId).lx2)
      .attr('y2', d => edgeEnd(d.nodeId).ly2)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-detail)')
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        onShowLinkTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    // Edge commit-count labels (shown only on node hover)
    linkLabelEls = root.append('g')
      .selectAll('g').data(links).join('g')
      .attr('transform', d => {
        const pos = positions[d.nodeId];
        if (!pos) return `translate(${cx},${cy})`;
        const end = edgeEnd(d.nodeId);
        return `translate(${(pos.x + end.lx2) / 2},${(pos.y + end.ly2) / 2})`;
      })
      .attr('pointer-events', 'none')
      .attr('display', 'none')
      .each(function(d) {
        const g = d3.select(this);
        const label = `${d.pct}%`;
        const r = Math.max(9, label.length * 4.5);
        const fs = label.length <= 4 ? 10 : 8;
        g.append('circle')
          .attr('r', r)
          .attr('fill', '#fff')
          .attr('stroke', d.authorColor ?? EDGE.HL_COLOR)
          .attr('stroke-width', 2);
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', d.authorColor ?? EDGE.HL_COLOR)
          .attr('font-size', `${fs}px`)
          .attr('font-weight', '700')
          .text(label);
      });

    updateEdgeStyles();

    // Ring nodes
    const commitMax = d3.max(ringNodes, d => d.commits) || 1;
    const rScale = d3.scaleSqrt().domain([0, commitMax]).range([8, 22]);

    nodeEls = root.append('g')
      .selectAll('g').data(ringNodes).join('g')
      .attr('transform', d => { const p = positions[d.id]; return `translate(${p.x},${p.y})`; })
      .style('cursor', d => d.type === 'team-collapsed' ? 'pointer' : 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        const repoTotal = repoNode?.commits || 1;
        const authorContributions = d.type === 'team-collapsed'
          ? d.authors.map(a => ({
              authorId: a.id,
              commits: a.commits,
              pct: ((a.commits / repoTotal) * 100).toFixed(1).replace(/\.0$/, ''),
            })).sort((a, b) => b.commits - a.commits)
          : null;
        onShowNodeTooltip(
          { ...d, type: d.type === 'team-collapsed' ? 'team-collapsed' : 'author', authorContributions },
          e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y
        );
      })
      .on('mousemove', e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); })
      .on('click', (e, d) => {
        if (d.type !== 'team-collapsed') return;
        expandedTeams.add(d.team.id);
        onHideTooltip();
        draw(lastDrawArgs);
      });

    // Split a name into at most 2 lines at a word boundary, target ~12 chars per line
    function pillLines(name) {
      if (name.length <= 13) return [name];
      const mid = Math.ceil(name.length / 2);
      const spaceAfter = name.indexOf(' ', mid - 4);
      const spaceBefore = name.lastIndexOf(' ', mid + 4);
      const split = spaceAfter !== -1 ? spaceAfter : spaceBefore !== -1 ? spaceBefore : mid;
      return [name.slice(0, split).trim(), name.slice(split).trim()];
    }

    nodeEls.filter(d => d.type === 'team-collapsed').append('rect')
      .attr('x', -50).attr('y', -22)
      .attr('width', 100).attr('height', 44)
      .attr('rx', 10)
      .attr('fill', d => d.color ?? '#9CA3AF')
      .attr('fill-opacity', NODE.OPACITY_TEAM)
      .attr('stroke', NODE.STROKE)
      .attr('stroke-width', 2);

    nodeEls.filter(d => d.type === 'author').append('circle')
      .attr('r', d => rScale(d.commits))
      .attr('fill', d => d.color ?? '#9CA3AF')
      .attr('stroke', NODE.STROKE)
      .attr('stroke-width', NODE.STROKE_WIDTH)
      .attr('opacity', NODE.OPACITY);

    // Collapse button inside expanded team arc midpoint
    for (const g of groups) {
      if (!g.team || !expandedTeams.has(g.team.id)) continue;
      // Find midpoint angle of this group's arc in positions
      const authorPositions = g.authors.map(a => positions[a.id]).filter(Boolean);
      if (!authorPositions.length) continue;
      const angles = authorPositions.map(p => Math.atan2(p.y - cy, p.x - cx));
      const midAngle = (Math.min(...angles) + Math.max(...angles)) / 2;
      // Place collapse button outside author nodes; with 1 author extra gap needed
      const maxAuthorR = 22; // rScale max
      const labelH = 13;
      const btnR = R + maxAuthorR + labelH + 50;
      const bx = cx + Math.cos(midAngle) * btnR;
      const by = cy + Math.sin(midAngle) * btnR;

      const btn = root.append('g')
        .attr('transform', `translate(${bx},${by})`)
        .style('cursor', 'pointer')
        .on('click', () => {
          expandedTeams.delete(g.team.id);
          onHideTooltip();
          draw(lastDrawArgs);
        });

      btn.append('rect')
        .attr('x', -50).attr('y', -22)
        .attr('width', 100).attr('height', 44)
        .attr('rx', 10)
        .attr('fill', g.team.color)
        .attr('fill-opacity', NODE.OPACITY_TEAM)
        .attr('stroke', NODE.STROKE)
        .attr('stroke-width', 2);
      const btnLines = pillLines(g.team.name);
      const btnNameY = btnLines.length === 1 ? '-0.2em' : '-0.8em';
      const btnNameText = btn.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', NODE.STROKE)
        .attr('font-size', '12px').attr('font-weight', '700')
        .attr('pointer-events', 'none');
      btnLines.forEach((line, i) => {
        btnNameText.append('tspan')
          .attr('x', 0).attr('dy', i === 0 ? btnNameY : '1.1em')
          .text(line);
      });
      btn.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', btnLines.length === 1 ? '1em' : '2.2em')
        .attr('fill', 'rgba(255,255,255,0.82)').attr('font-size', '9px')
        .attr('pointer-events', 'none')
        .text('− collapse');
    }

    // Pill label: name (wrapped) + sublabel like swimlane anchor
    nodeEls.filter(d => d.type === 'team-collapsed').each(function(d) {
      const g = d3.select(this);
      const lines = pillLines(d.teamName);
      const sublabel = `${d.authors.length} ${d.authors.length === 1 ? 'dev' : 'devs'} · ${d.commits.toLocaleString()} commits`;
      const nameY = lines.length === 1 ? '-0.2em' : '-0.8em';
      const nameText = g.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', NODE.STROKE).attr('font-size', '12px').attr('font-weight', '700')
        .attr('pointer-events', 'none');
      lines.forEach((line, i) => {
        nameText.append('tspan')
          .attr('x', 0).attr('dy', i === 0 ? nameY : '1.1em')
          .text(line);
      });
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', lines.length === 1 ? '1em' : '2.2em')
        .attr('fill', 'rgba(255,255,255,0.82)').attr('font-size', '9px')
        .attr('pointer-events', 'none')
        .text(sublabel);
    });

    // Author label: below circle
    nodeEls.filter(d => d.type === 'author').append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => rScale(d.commits) + 13)
      .attr('fill', NODE.LABEL_COLOR).attr('font-size', NODE.LABEL_SIZE).attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => anonymize(d.id));

    // Compute per-team contributions for repo tooltip
    const teamCommits = {};
    for (const l of data.links) {
      const authorId = typeof l.source === 'object' ? l.source.id : l.source;
      const t = authorTeam[authorId];
      const key = t ? t.id : '__unassigned__';
      teamCommits[key] = (teamCommits[key] ?? 0) + l.commits;
    }
    const repoContributions = Object.entries(teamCommits).map(([teamId, commits]) => {
      const t = teams.find(t => t.id === teamId);
      return { teamId, commits, teamColor: t?.color ?? '#9CA3AF' };
    });
    const owningTeamId = (() => {
      let best = null, bestC = 0;
      for (const c of repoContributions) { if (c.commits > bestC) { bestC = c.commits; best = c.teamId; } }
      return best;
    })();

    // Repo node at center
    if (repoNode) {
      const repoG = root.append('g')
        .attr('transform', `translate(${cx},${cy})`)
        .style('cursor', 'default')
        .on('mouseenter', (e) => {
          onShowNodeTooltip(
            { id: repoNode.id, type: 'repo', commits: repoNode.commits,
              teamName: '', repoCount: 0, authorCount: 0,
              contributions: repoContributions, owningTeamId },
            e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y
          );
        })
        .on('mousemove', e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
        .on('mouseleave', () => onHideTooltip());

      repoG.append('rect')
        .attr('x', -repoR).attr('y', -repoR)
        .attr('width', repoR * 2).attr('height', repoR * 2)
        .attr('rx', 4)
        .attr('fill', getNodeColor(repoNode.id, 'repo') ?? '#9CA3AF')
        .attr('fill-opacity', 0.45)
        .attr('stroke', NODE.STROKE).attr('stroke-width', EDGE.WIDTH);
      repoG.append('text')
        .attr('text-anchor', 'middle').attr('dy', repoR + 13)
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
  }

  function updateNodeColors() {}
  function drawOverlays() {}

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
