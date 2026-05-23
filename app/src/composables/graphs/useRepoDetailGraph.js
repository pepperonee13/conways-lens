import * as d3 from 'd3';
import { EDGE, NODE, ARROW, TOOLTIP_OFFSET } from './graphConstants.js';

/**
 * Radial repo-detail graph: one repo at center, contributing authors around it.
 * Authors are grouped into team arcs. No force simulation — static layout.
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
}) {
  let nodeEls = null;
  let linkEls = null;

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
  }

  function highlightNode(d) {
    if (!linkEls) return;
    linkEls
      .attr('stroke',  l => l.authorId === d.id ? (l.authorColor ?? EDGE.HL_COLOR) : edgeStroke(l))
      .attr('display', l => l.authorId === d.id ? null : 'none')
      .attr('opacity', EDGE.HL_OPACITY);
  }

  function resetHighlight() {
    updateEdgeStyles();
  }

  function draw({ dims, data }) {
    if (!svgRef.value) return;

    const { w, h } = dims;
    const cx = w / 2, cy = h / 2;

    // Build team lookup: authorId → team
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

    // Build ordered author list: team groups sorted by team index, then unassigned
    const groups = Object.values(teamGroups);
    if (unassigned.length) groups.push({ team: null, authors: unassigned });

    const totalAuthors = data.nodes.filter(n => n.type === 'author').length;
    const R = Math.min(w, h) * 0.36 + totalAuthors * 3;
    const repoR = 22;
    const authorR = 14;
    const GAP_FRAC = 0.04; // angular gap between team groups as fraction of 2π

    // Assign angle to each author: divide 2π into group arcs proportional to size
    const totalGap = GAP_FRAC * 2 * Math.PI * groups.length;
    const arcPerAuthor = (2 * Math.PI - totalGap) / Math.max(totalAuthors, 1);

    const positions = {}; // authorId → { x, y, color }
    let angle = -Math.PI / 2; // start at top

    for (const g of groups) {
      const arcSize = arcPerAuthor * g.authors.length;
      // Sort authors within group by commit count descending
      g.authors.sort((a, b) => b.commits - a.commits);
      for (let i = 0; i < g.authors.length; i++) {
        const a = g.authors[i];
        const theta = angle + arcPerAuthor * (i + 0.5);
        positions[a.id] = {
          x: cx + Math.cos(theta) * R,
          y: cy + Math.sin(theta) * R,
          color: g.team?.color ?? '#9CA3AF',
          teamName: g.team?.name ?? 'Unassigned',
        };
      }
      angle += arcSize + GAP_FRAC * 2 * Math.PI;
    }

    // Build link data with pre-resolved positions
    const links = data.links.map(l => {
      const authorId = typeof l.source === 'object' ? l.source.id : l.source;
      const pos = positions[authorId];
      return { ...l, authorId, authorColor: pos?.color };
    });

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow-detail')
      .attr('viewBox', ARROW.VIEWBOX).attr('refX', ARROW.REF_X).attr('refY', ARROW.REF_Y)
      .attr('markerWidth', ARROW.SIZE).attr('markerHeight', ARROW.SIZE)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on('zoom', e => root.attr('transform', e.transform)));

    // Draw team arc labels (outside the ring)
    const labelR = R + 28;
    angle = -Math.PI / 2;
    for (const g of groups) {
      if (!g.team) { angle += arcPerAuthor * g.authors.length + GAP_FRAC * 2 * Math.PI; continue; }
      const arcSize = arcPerAuthor * g.authors.length;
      const midTheta = angle + arcSize / 2;
      const lx = cx + Math.cos(midTheta) * labelR;
      const ly = cy + Math.sin(midTheta) * labelR;
      root.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', g.team.color).attr('font-size', '11px').attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text(g.team.name);
      angle += arcSize + GAP_FRAC * 2 * Math.PI;
    }

    // Edges
    linkEls = root.append('g')
      .selectAll('line').data(links).join('line')
      .attr('x1', d => positions[d.authorId]?.x ?? cx)
      .attr('y1', d => positions[d.authorId]?.y ?? cy)
      .attr('x2', cx).attr('y2', cy)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow-detail)')
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        onShowLinkTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    updateEdgeStyles();

    // Author nodes
    const authorData = data.nodes.filter(n => n.type === 'author').map(n => ({
      ...n, ...positions[n.id],
    }));

    const commitMax = d3.max(authorData, d => d.commits) || 1;
    const rScale = d3.scaleSqrt().domain([0, commitMax]).range([8, 22]);

    nodeEls = root.append('g')
      .selectAll('g').data(authorData).join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        onShowNodeTooltip(d, e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y);
      })
      .on('mousemove', e => onMoveTooltip(e.clientX + TOOLTIP_OFFSET.x, e.clientY + TOOLTIP_OFFSET.y))
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    nodeEls.append('circle')
      .attr('r', d => rScale(d.commits))
      .attr('fill', d => d.color ?? '#9CA3AF')
      .attr('stroke', NODE.STROKE).attr('stroke-width', NODE.STROKE_WIDTH)
      .attr('opacity', NODE.OPACITY);

    nodeEls.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => rScale(d.commits) + 13)
      .attr('fill', NODE.LABEL_COLOR).attr('font-size', NODE.LABEL_SIZE).attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => anonymize(d.id));

    // Repo node at center
    if (repoNode) {
      const repoG = root.append('g').attr('transform', `translate(${cx},${cy})`);
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
  }

  function updateNodeColors() {}
  function drawOverlays() {}

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
