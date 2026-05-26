import * as d3 from 'd3';
import { EDGE, NODE, ARROW, TOOLTIP_OFFSET, NODE_LABEL_OFFSET, REPO_DETAIL, FOLDER_GRAPH } from './graphConstants.js';
import { calcEdgeWidth, toPct } from './graphUtils.js';

/**
 * Bipartite folder-drill graph: teams/authors on the left, folder nodes on the right.
 * Clicking a folder with children triggers onFolderClick(segmentId) to drill deeper.
 * Teams start collapsed; clicking expands to individual authors whose edges go only to
 * folders they actually contributed to.
 */
export function useRepoFolderGraph({
  svgRef,
  effectiveTeams,
  getNodeColor,
  anonMap,
  onShowNodeTooltip,
  onShowLinkTooltip,
  onMoveTooltip,
  onHideTooltip,
  onFolderClick,
  edgeWeight,
  violationThreshold,
}) {
  let linkEls = null;
  let linkLabelEls = null;
  const expandedTeams = new Set();
  let lastDrawArgs = null;
  let zoomBehavior = null;
  let savedTransform = null;

  function edgeStroke(d) { return d.authorColor ?? EDGE.COLOR; }
  function edgeWidth(d)  { return calcEdgeWidth(d.commits, edgeWeight.value); }

  function updateEdgeStyles() {
    if (!linkEls) return;
    linkEls
      .attr('stroke',       d => edgeStroke(d))
      .attr('stroke-width', d => edgeWidth(d))
      .attr('display',      null)
      .attr('opacity',      EDGE.HL_OPACITY);
    if (linkLabelEls) linkLabelEls.attr('display', 'none');
  }

  function highlightNode(id) {
    if (!linkEls) return;
    linkEls
      .attr('stroke',  l => (l.sourceId === id || l.targetId === id) ? (l.authorColor ?? EDGE.HL_COLOR) : edgeStroke(l))
      .attr('display', l => (l.sourceId === id || l.targetId === id) ? null : 'none')
      .attr('opacity', EDGE.HL_OPACITY);
    if (linkLabelEls)
      linkLabelEls.attr('display', l => (l.sourceId === id || l.targetId === id) ? null : 'none');
  }

  function resetHighlight() { updateEdgeStyles(); }

  function draw({ dims, data }) {
    if (!svgRef.value) return;
    lastDrawArgs = { dims, data };

    const { w, h } = dims;
    const { AUTHOR_R_MIN, AUTHOR_R_MAX, PILL_W, PILL_H, PILL_RX } = REPO_DETAIL;
    const { FOLDER_HALF_W, FOLDER_H, FOLDER_RX, EDGE_GAP } = FOLDER_GRAPH;

    // ── Data preparation ─────────────────────────────────────────────────────

    const teams = effectiveTeams.value;
    const authorTeam = {};
    for (const t of teams) {
      for (const a of (t.authors ?? [])) {
        if (!(a in authorTeam)) authorTeam[a] = t;
      }
    }

    const repoNode    = data.nodes.find(n => n.type === 'repo');
    const folderNodes = data.nodes.filter(n => n.type === 'folder').sort((a, b) => b.commits - a.commits);
    const authorNodes = data.nodes.filter(n => n.type === 'author');
    const repoTotal   = repoNode?.commits || 1;

    const teamGroups = {};
    const unassigned = [];
    for (const node of authorNodes) {
      const t = authorTeam[node.id];
      if (t) (teamGroups[t.id] ??= { team: t, authors: [] }).authors.push(node);
      else    unassigned.push(node);
    }
    for (const g of Object.values(teamGroups)) {
      g.totalCommits = g.authors.reduce((s, a) => s + (a.commits ?? 0), 0);
    }

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

    // author → { folderId → commits }
    const authorFolderMap = {};
    for (const l of data.links) {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      (authorFolderMap[src] ??= {})[tgt] = ((authorFolderMap[src] ?? {})[tgt] ?? 0) + l.commits;
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    const LEFT_X   = w * 0.27;
    const RIGHT_X  = w * 0.73;
    const TOP_PAD  = 50;
    const BOT_PAD  = 50;
    const GROUP_GAP = 14;
    const usableH  = h - TOP_PAD - BOT_PAD;

    const totalLeftSlots = groups.reduce((s, g) =>
      s + (g.team && !expandedTeams.has(g.team.id) ? 1 : g.authors.length), 0);
    const totalGroupGaps = Math.max(0, groups.length - 1) * GROUP_GAP;
    const SLOT_H = Math.min(70, Math.max(36, (usableH - totalGroupGaps) / Math.max(totalLeftSlots, 1)));

    const leftPositions = {};
    const leftNodes = [];
    let leftY = TOP_PAD + Math.max(0, usableH - totalLeftSlots * SLOT_H - totalGroupGaps) / 2 + SLOT_H / 2;

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const collapsed = g.team && !expandedTeams.has(g.team.id);
      if (collapsed) {
        const nodeId = `team-collapsed:${g.team.id}`;
        leftPositions[nodeId] = { x: LEFT_X, y: leftY, color: g.team.color, teamName: g.team.name };
        leftNodes.push({
          id: nodeId, type: 'team-collapsed',
          commits: g.totalCommits, pct: toPct(g.totalCommits, repoTotal),
          color: g.team.color, teamName: g.team.name,
          team: g.team, authors: g.authors,
        });
        leftY += SLOT_H;
      } else {
        g.authors.sort((a, b) => b.commits - a.commits);
        for (const a of g.authors) {
          leftPositions[a.id] = { x: LEFT_X, y: leftY, color: g.team?.color ?? '#9CA3AF', teamName: g.team?.name ?? 'Unassigned' };
          leftNodes.push({
            id: a.id, type: 'author',
            commits: a.commits, pct: toPct(a.commits, repoTotal),
            color: g.team?.color ?? '#9CA3AF', teamName: g.team?.name ?? 'Unassigned',
          });
          leftY += SLOT_H;
        }
      }
      if (gi < groups.length - 1) leftY += GROUP_GAP;
    }

    // Right side: folder positions
    const rightSlotH  = Math.min(70, Math.max(36, usableH / Math.max(folderNodes.length, 1)));
    const rightStartY = TOP_PAD + (usableH - rightSlotH * folderNodes.length) / 2 + rightSlotH / 2;
    const rightPositions = {};
    for (let i = 0; i < folderNodes.length; i++) {
      rightPositions[folderNodes[i].id] = { x: RIGHT_X, y: rightStartY + i * rightSlotH };
    }

    const repoColor = getNodeColor(repoNode?.id ?? '', 'repo') ?? '#9CA3AF';
    const rScale = d3.scaleSqrt()
      .domain([0, d3.max(leftNodes, d => d.commits) || 1])
      .range([AUTHOR_R_MIN, AUTHOR_R_MAX]);

    // ── Build edges ───────────────────────────────────────────────────────────

    const edges = [];
    for (const g of groups) {
      const collapsed = g.team && !expandedTeams.has(g.team.id);
      if (collapsed) {
        const nodeId = `team-collapsed:${g.team.id}`;
        const teamFolderCommits = {};
        for (const a of g.authors) {
          for (const [fid, cnt] of Object.entries(authorFolderMap[a.id] ?? {})) {
            teamFolderCommits[fid] = (teamFolderCommits[fid] ?? 0) + cnt;
          }
        }
        for (const [fid, cnt] of Object.entries(teamFolderCommits)) {
          if (!rightPositions[fid]) continue;
          edges.push({ sourceId: nodeId, targetId: fid, displaySource: g.team.name, authorColor: g.team.color, commits: cnt, pct: toPct(cnt, repoTotal) });
        }
      } else {
        for (const a of g.authors) {
          for (const [fid, cnt] of Object.entries(authorFolderMap[a.id] ?? {})) {
            if (!rightPositions[fid]) continue;
            edges.push({ sourceId: a.id, targetId: fid, displaySource: anonMap.value[a.id] ?? a.id, authorColor: leftPositions[a.id]?.color, commits: cnt, pct: toPct(cnt, repoTotal) });
          }
        }
      }
    }

    // ── SVG setup ────────────────────────────────────────────────────────────

    const svg = d3.select(svgRef.value);
    if (zoomBehavior) savedTransform = d3.zoomTransform(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow-folder')
      .attr('viewBox', ARROW.VIEWBOX).attr('refX', 0).attr('refY', ARROW.REF_Y)
      .attr('markerWidth', ARROW.SIZE).attr('markerHeight', ARROW.SIZE)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    zoomBehavior = d3.zoom().scaleExtent([0.4, 4]).on('zoom', e => root.attr('transform', e.transform));
    svg.call(zoomBehavior);
    if (savedTransform) svg.call(zoomBehavior.transform, savedTransform);

    // ── Edge helpers ─────────────────────────────────────────────────────────

    function leftEdgeX(nodeId) {
      const node = leftNodes.find(n => n.id === nodeId);
      if (!node) return LEFT_X;
      return node.type === 'team-collapsed' ? LEFT_X + PILL_W / 2 : LEFT_X + rScale(node.commits);
    }

    const rightEdgeX = RIGHT_X - FOLDER_HALF_W - EDGE_GAP;

    function curvePath(x1, y1, x2, y2) {
      const cpX = (x1 + x2) / 2;
      return `M${x1},${y1} C${cpX},${y1} ${cpX},${y2} ${x2},${y2}`;
    }

    // ── Edges ────────────────────────────────────────────────────────────────

    linkEls = root.append('g')
      .selectAll('path').data(edges).join('path')
      .attr('d', d => {
        const lp = leftPositions[d.sourceId];
        const rp = rightPositions[d.targetId];
        if (!lp || !rp) return '';
        return curvePath(leftEdgeX(d.sourceId), lp.y, rightEdgeX, rp.y);
      })
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-folder)')
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => onShowLinkTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mousemove',  e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    // ── Pct badges (shown only on hover) ─────────────────────────────────────

    const PCT_R_MIN = 10, PCT_R_MAX = 18, PCT_TEXT_PAD = 5;
    const pctBadgeScale = d3.scaleSqrt().domain([0, 100]).range([PCT_R_MIN, PCT_R_MAX]).clamp(true);

    linkLabelEls = root.append('g')
      .selectAll('g').data(edges).join('g')
      .attr('transform', d => {
        const lp = leftPositions[d.sourceId];
        const rp = rightPositions[d.targetId];
        if (!lp || !rp) return 'translate(0,0)';
        return `translate(${(leftEdgeX(d.sourceId) + rightEdgeX) / 2},${(lp.y + rp.y) / 2})`;
      })
      .attr('pointer-events', 'none')
      .each(function(d) {
        const g     = d3.select(this);
        const label = `${d.pct}%`;
        const pctR  = Math.max(PCT_R_MIN, pctBadgeScale(parseFloat(d.pct) || 0));
        const fs    = pctR >= 14 ? 10 : 8;
        const textEl = g.append('text')
          .attr('text-anchor', 'middle').attr('dy', '0.35em')
          .attr('fill', d.authorColor ?? EDGE.HL_COLOR)
          .attr('font-size', `${fs}px`).attr('font-weight', '700')
          .text(label);
        const bbox = textEl.node().getBBox();
        const r = Math.max(pctR, Math.ceil(Math.max(bbox.width, bbox.height) / 2) + PCT_TEXT_PAD);
        g.insert('circle', 'text').attr('r', r).attr('fill', '#fff')
          .attr('stroke', d.authorColor ?? EDGE.HL_COLOR).attr('stroke-width', 2);
      });

    updateEdgeStyles();

    // ── Folder nodes (right) ─────────────────────────────────────────────────

    const folderEls = root.append('g')
      .selectAll('g').data(folderNodes).join('g')
      .attr('transform', d => { const p = rightPositions[d.id]; return `translate(${p.x},${p.y})`; })
      .style('cursor', d => d.hasChildren ? 'pointer' : 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d.id);
        onShowNodeTooltip(
          { ...d, type: 'folder', pct: toPct(d.commits, repoTotal), folderFullPath: d.fullPath ?? d.id, action: d.hasChildren ? 'Click to explore subfolders' : '' },
          e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y
        );
      })
      .on('mousemove',  e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); })
      .on('click', (e, d) => {
        if (!d.hasChildren) return;
        onHideTooltip();
        onFolderClick?.(d.id);
      });

    folderEls.append('rect')
      .attr('x', -FOLDER_HALF_W).attr('y', -FOLDER_H / 2)
      .attr('width', FOLDER_HALF_W * 2).attr('height', FOLDER_H)
      .attr('rx', FOLDER_RX)
      .attr('fill', repoColor).attr('fill-opacity', 0.45)
      .attr('stroke', NODE.STROKE).attr('stroke-width', NODE.STROKE_WIDTH);

    // Name inside the rect; shift left to leave room for › when drillable
    folderEls.append('text')
      .attr('text-anchor', 'middle')
      .attr('x', d => d.hasChildren ? -10 : 0)
      .attr('dy', '0.35em')
      .attr('fill', NODE.STROKE).attr('font-size', '11px').attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => d.id.length > 20 ? d.id.slice(0, 18) + '…' : d.id);

    // › at right edge for drillable folders
    folderEls.filter(d => d.hasChildren).append('text')
      .attr('text-anchor', 'middle')
      .attr('x', FOLDER_HALF_W - 14)
      .attr('dy', '0.35em')
      .attr('fill', NODE.STROKE).attr('font-size', '14px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text('›');

    // ── Left nodes ────────────────────────────────────────────────────────────

    function pillLines(name) {
      if (name.length <= 13) return [name];
      const mid = Math.ceil(name.length / 2);
      const spaceAfter  = name.indexOf(' ', mid - 4);
      const spaceBefore = name.lastIndexOf(' ', mid + 4);
      const split = spaceAfter !== -1 ? spaceAfter : spaceBefore !== -1 ? spaceBefore : mid;
      return [name.slice(0, split).trim(), name.slice(split).trim()];
    }

    function drawPillBody(sel, colorFn) {
      sel.append('rect')
        .attr('x', -PILL_W / 2).attr('y', -PILL_H / 2)
        .attr('width', PILL_W).attr('height', PILL_H).attr('rx', PILL_RX)
        .attr('fill', colorFn)
        .attr('fill-opacity', NODE.OPACITY_TEAM)
        .attr('stroke', NODE.STROKE).attr('stroke-width', 2);
    }

    function drawPillLabel(sel, name, sublabel) {
      const lines = pillLines(name);
      const nameY = lines.length === 1 ? '-0.2em' : '-0.8em';
      const subDy = lines.length === 1 ? '1em' : '2.2em';
      const nameEl = sel.append('text')
        .attr('text-anchor', 'middle').attr('fill', NODE.STROKE)
        .attr('font-size', '12px').attr('font-weight', '700').attr('pointer-events', 'none');
      lines.forEach((line, i) => {
        nameEl.append('tspan').attr('x', 0).attr('dy', i === 0 ? nameY : '1.1em').text(line);
      });
      sel.append('text').attr('text-anchor', 'middle').attr('dy', subDy)
        .attr('fill', 'rgba(255,255,255,0.82)').attr('font-size', '9px').attr('pointer-events', 'none')
        .text(sublabel);
    }

    const leftEls = root.append('g')
      .selectAll('g').data(leftNodes).join('g')
      .attr('transform', d => { const p = leftPositions[d.id]; return `translate(${p.x},${p.y})`; })
      .style('cursor', d => d.type === 'team-collapsed' ? 'pointer' : 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d.id);
        const authorContributions = d.type === 'team-collapsed'
          ? d.authors.map(a => ({ authorId: a.id, commits: a.commits, pct: toPct(a.commits, repoTotal), teamColor: d.team?.color ?? null })).sort((a, b) => b.commits - a.commits)
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

    drawPillBody(leftEls.filter(d => d.type === 'team-collapsed'), d => d.color ?? '#9CA3AF');
    leftEls.filter(d => d.type === 'team-collapsed').each(function(d) {
      drawPillLabel(
        d3.select(this), d.teamName,
        `${d.authors.length} ${d.authors.length === 1 ? 'dev' : 'devs'} · ${d.commits.toLocaleString()} commits`
      );
    });

    leftEls.filter(d => d.type === 'author').append('circle')
      .attr('r', d => rScale(d.commits))
      .attr('fill', d => d.color ?? '#9CA3AF')
      .attr('stroke', NODE.STROKE).attr('stroke-width', NODE.STROKE_WIDTH)
      .attr('opacity', NODE.OPACITY);
    leftEls.filter(d => d.type === 'author').append('text')
      .attr('text-anchor', 'middle').attr('dy', d => rScale(d.commits) + NODE_LABEL_OFFSET)
      .attr('fill', NODE.LABEL_COLOR).attr('font-size', NODE.LABEL_SIZE).attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => anonMap.value[d.id] ?? d.id);

    // ── Collapse buttons ──────────────────────────────────────────────────────

    for (const g of groups) {
      if (!g.team || !expandedTeams.has(g.team.id)) continue;
      const authorYs = g.authors.map(a => leftPositions[a.id]?.y).filter(y => y !== undefined);
      if (!authorYs.length) continue;
      const midY = (authorYs[0] + authorYs[authorYs.length - 1]) / 2;
      const btn  = root.append('g')
        .attr('transform', `translate(${LEFT_X - PILL_W - 20},${midY})`)
        .style('cursor', 'pointer')
        .on('click', () => { expandedTeams.delete(g.team.id); onHideTooltip(); draw(lastDrawArgs); });
      drawPillBody(btn, g.team.color);
      drawPillLabel(btn, g.team.name, '− collapse');
    }
  }

  function teardown() {
    linkEls = null;
    linkLabelEls = null;
    expandedTeams.clear();
    lastDrawArgs = null;
    zoomBehavior = null;
    savedTransform = null;
  }

  return { draw, updateEdgeStyles, updateNodeColors: () => {}, drawOverlays: () => {}, teardown };
}
