import * as d3 from 'd3';

const EDGE_COLOR    = '#94a3b8';
const EDGE_OPACITY  = 0.5;
const EDGE_HL_COLOR = '#225EA9';
const DIM_OPACITY   = 0.08;

/**
 * Factory that encapsulates all D3 drawing logic for the author-contribution
 * bipartite graph (authors ↔ repos, optionally grouped by team).
 *
 * @param {object} opts
 * @param {import('vue').Ref}      opts.svgRef
 * @param {import('vue').ComputedRef} opts.effectiveTeams
 * @param {import('vue').Ref}      opts.expandedTeams
 * @param {import('vue').ComputedRef} opts.nodeColors
 * @param {Function}               opts.getNodeColor
 * @param {Function}               opts.toggleTeamExpansion
 * @param {Function}               opts.anonymize
 * @param {object}                 opts.savedPositions   plain object { [nodeId]: { x, y } }
 * @param {Function}               opts.onShowNodeTooltip (d, x, y) => void
 * @param {Function}               opts.onShowLinkTooltip (d, x, y) => void
 * @param {Function}               opts.onMoveTooltip    (x, y) => void
 * @param {Function}               opts.onHideTooltip    () => void
 * @param {import('vue').Reactive} opts.config           reactive simConfig object
 * @param {import('vue').Ref}      opts.edgeWeight       ref<boolean>
 * @param {import('vue').Ref}      opts.teamBoundary     ref<string> 'none'|'blur'|'density'
 * @param {import('vue').Ref}      opts.showAuthors      ref<boolean>
 *
 * @returns {{ draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown }}
 */
export function useAuthorContributionGraph({
  svgRef,
  effectiveTeams,
  expandedTeams,
  nodeColors,
  getNodeColor,
  toggleTeamExpansion,
  anonymize,
  savedPositions,
  onShowNodeTooltip,
  onShowLinkTooltip,
  onMoveTooltip,
  onHideTooltip,
  config,
  edgeWeight,
  teamBoundary,
  showAuthors,
}) {
  let nodeEls    = null;
  let linkEls    = null;
  let cloudGroup = null;
  let sim        = null;
  let simNodes   = null;
  let nodeTeamId    = {};
  let nodeTeamColor = {};

  // ── Team boundary helpers ──────────────────────────────────────────────────

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

  function drawOverlays() {
    if (!cloudGroup || !simNodes) return;
    cloudGroup.selectAll('*').remove();
    if (teamBoundary.value === 'none') return;

    for (const t of effectiveTeams.value) {
      // Only cloud expanded teams — collapsed teams are already a labeled pill
      if (!expandedTeams.value.has(t.id)) continue;
      const pts = simNodes
        .filter(n => n.x != null && nodeTeamId[n.id] === t.id)
        .map(n => [n.x, n.y, n.r]);
      if (pts.length < 1) continue;

      if (teamBoundary.value === 'blur') {
        // Outer blurred halo
        const fullPath = teamHullPath(pts, 52);
        if (fullPath)
          cloudGroup.append('path').attr('d', fullPath)
            .attr('fill', t.color + '3E').attr('stroke', t.color + '55')
            .attr('stroke-width', 3).attr('filter', `url(#blur-soft-${t.id})`);
        // Crisp core boundary
        const corePath = teamHullPath(pts, 22);
        if (corePath)
          cloudGroup.append('path').attr('d', corePath)
            .attr('fill', t.color + '26').attr('stroke', t.color)
            .attr('stroke-width', 2).attr('stroke-dasharray', '5 3')
            .attr('stroke-opacity', 0.65);

      } else if (teamBoundary.value === 'density') {
        // Gaussian blob per node, all under one heavy blur filter
        const g = cloudGroup.append('g').attr('filter', `url(#blur-kde-${t.id})`);
        for (const [x, y, r] of pts)
          g.append('circle').attr('cx', x).attr('cy', y)
            .attr('r', (r + 44) * 1.8).attr('fill', t.color).attr('opacity', 0.22);
      }
    }
  }

  // ── Edge geometry helper ───────────────────────────────────────────────────

  function squareEdgeDist(ux, uy, r) {
    const tx = Math.abs(ux) > 1e-9 ? r / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-9 ? r / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
  }

  // ── Edge weight helpers ────────────────────────────────────────────────────

  function edgeSrcColor(link) {
    const srcTeam = nodeTeamId[link.source.id];
    const tgtTeam = nodeTeamId[link.target.id];
    if (srcTeam && tgtTeam && srcTeam !== tgtTeam)
      return nodeTeamColor[link.source.id] ?? EDGE_COLOR;
    return EDGE_COLOR;
  }

  function edgeStrokeWidth(link) {
    return edgeWeight.value ? Math.max(1, 1 + Math.log1p(link.commits) * 0.9) : 1.5;
  }

  function edgeStrokeOpacity(link) {
    if (!edgeWeight.value) return EDGE_OPACITY;
    const srcTeam = nodeTeamId[link.source.id];
    const tgtTeam = nodeTeamId[link.target.id];
    if (!srcTeam || !tgtTeam) return EDGE_OPACITY;
    return (srcTeam !== tgtTeam) ? 0.75 : 0.18;
  }

  function updateEdgeStyles() {
    if (!linkEls) return;
    linkEls
      .attr('stroke',         d => edgeWeight.value ? edgeSrcColor(d)        : EDGE_COLOR)
      .attr('stroke-width',   d => edgeStrokeWidth(d))
      .attr('stroke-opacity', d => edgeStrokeOpacity(d));
  }

  // ── Highlight helpers ──────────────────────────────────────────────────────

  function highlightNode(d) {
    const connected = new Set([d.id]);
    linkEls.each(l => {
      const s = l.source.id, t = l.target.id;
      if (s === d.id || t === d.id) { connected.add(s); connected.add(t); }
    });
    nodeEls.attr('opacity', n => connected.has(n.id) ? 1 : DIM_OPACITY);
    linkEls
      .attr('stroke', l => (l.source.id === d.id || l.target.id === d.id)
        ? EDGE_HL_COLOR
        : (edgeWeight.value ? edgeSrcColor(l) : EDGE_COLOR))
      .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.9 : DIM_OPACITY);
  }

  function highlightLink(d) {
    const s = d.source.id, t = d.target.id;
    nodeEls.attr('opacity', n => (n.id === s || n.id === t) ? 1 : DIM_OPACITY);
    linkEls
      .attr('stroke', l => l === d
        ? EDGE_HL_COLOR
        : (edgeWeight.value ? edgeSrcColor(l) : EDGE_COLOR))
      .attr('stroke-opacity', l => l === d ? 0.9 : DIM_OPACITY);
  }

  function resetHighlight() {
    if (!nodeEls || !linkEls) return;
    nodeEls.attr('opacity', 1);
    updateEdgeStyles();
  }

  // ── Node color update ──────────────────────────────────────────────────────

  function updateNodeColors() {
    if (!nodeEls) return;
    nodeEls.filter(d => d.type === 'author').select('circle').attr('fill', d => getNodeColor(d.id, 'author'));
    nodeEls.filter(d => d.type === 'repo')  .select('rect')  .attr('fill', d => getNodeColor(d.id, 'repo'));
  }

  // ── Node interaction helpers ───────────────────────────────────────────────

  function isNodeExpandable(d) {
    return d.type === 'team';
  }

  function isNodeExpanded(d) {
    return expandedTeams.value.has(d.teamId);
  }

  function handleNodeClick(d) {
    if (d.type === 'team') toggleTeamExpansion(d.teamId);
  }

  // ── Full draw ──────────────────────────────────────────────────────────────

  function draw({ dims, data }) {
    if (!svgRef.value) return;
    if (sim) { sim.stop(); sim = null; }

    let { nodes: rawNodes, links: rawLinks } = data;
    const { w, h } = dims;
    const cfg = config;

    const hasData = rawNodes.length > 0;
    if (!hasData) return;

    // When authors are hidden: remove author nodes and lift their edges up to
    // the team level (only possible for collapsed teams that have a team node).
    // Skip entirely when no teams exist — authors can't be lifted to anything.
    if (!showAuthors.value && effectiveTeams.value.length > 0) {
      const authorTeamNode = {};
      for (const t of effectiveTeams.value) {
        for (const a of (t.authors ?? [])) authorTeamNode[a] = `team:${t.id}`;
      }
      const visibleIds = new Set(rawNodes.filter(n => n.type !== 'author').map(n => n.id));
      const agg = {};
      for (const l of rawLinks) {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        const srcNode = rawNodes.find(n => n.id === s);
        let src = s;
        if (srcNode?.type === 'author') {
          src = authorTeamNode[s];
          if (!src || !visibleIds.has(src)) continue; // author's team is expanded — skip
        }
        if (!visibleIds.has(src) || !visibleIds.has(t)) continue;
        const key = `${src}\x00${t}`;
        agg[key] = (agg[key] ?? 0) + (l.commits ?? 1);
      }
      rawNodes = rawNodes.filter(n => n.type !== 'author');
      rawLinks = Object.entries(agg).map(([key, commits]) => {
        const [source, target] = key.split('\x00');
        return { source, target, commits };
      });
    }

    const authMax    = d3.max(rawNodes.filter(n => n.type === 'author'), n => n.commits) || 1;
    const nonAuthMax = d3.max(rawNodes.filter(n => n.type !== 'author'), n => n.commits) || 1;

    const aScale     = d3.scaleSqrt().domain([0, authMax]).range([13, 40]);
    const otherScale = d3.scaleSqrt().domain([0, nonAuthMax]).range([14, 40]);
    const teamScale  = d3.scaleSqrt().domain([0, nonAuthMax]).range([28, 55]);

    const nodes = rawNodes.map(n => {
      const saved = savedPositions[n.id];
      let r;
      if (n.type === 'author') r = aScale(n.commits);
      else if (n.type === 'team') r = teamScale(n.commits);
      else r = otherScale(n.commits);
      return { ...n, r, x: saved?.x, y: saved?.y };
    });
    const links = rawLinks.map(l => ({ ...l }));

    // Detect bidirectional pairs and mark them for arc rendering.
    const linkKeySet = new Set(links.map(l => `${l.source}\x00${l.target}`));
    for (const l of links) {
      const rev = `${l.target}\x00${l.source}`;
      l.curvature = linkKeySet.has(rev) ? 1 : 0;
    }

    const hasTeams = effectiveTeams.value.length > 0;

    // Rebuild team-membership lookup maps used by edge helpers
    nodeTeamId    = {};
    nodeTeamColor = {};
    for (const t of effectiveTeams.value) {
      const key = `team:${t.id}`;
      nodeTeamId[key]    = t.id;
      nodeTeamColor[key] = t.color;
      for (const a of (t.authors ?? [])) { nodeTeamId[a]    = t.id; nodeTeamColor[a]    = t.color; }
      for (const r of (t.repos   ?? [])) { nodeTeamId[r]    = t.id; nodeTeamColor[r]    = t.color; }
    }

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const defs = svg.append('defs');

    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
      .attr('markerWidth', 14).attr('markerHeight', 14)
      .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'context-stroke');

    // Per-team blur filters — one per team to prevent color bleed between overlapping teams
    for (const t of effectiveTeams.value) {
      defs.append('filter').attr('id', `blur-soft-${t.id}`)
        .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%')
        .append('feGaussianBlur').attr('stdDeviation', 18);
      defs.append('filter').attr('id', `blur-kde-${t.id}`)
        .attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%')
        .append('feGaussianBlur').attr('stdDeviation', 38);
    }

    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => root.attr('transform', e.transform)));

    // Build lookup: author → their teams (for gravity)
    const authorToTeamsMap = {};
    for (const t of effectiveTeams.value) {
      for (const a of (t.authors ?? [])) {
        if (!authorToTeamsMap[a]) authorToTeamsMap[a] = [];
        authorToTeamsMap[a].push(t);
      }
    }

    // Team gravity: pull both author and repo nodes toward their team centroid.
    function teamGravity(alpha) {
      if (!hasTeams || cfg.teamGravity === 0) return;
      const k = cfg.teamGravity * alpha;

      function nodeTeam(n) {
        if (n.type === 'author') {
          const t = (authorToTeamsMap[n.id] ?? []).find(t => expandedTeams.value.has(t.id));
          return t?.id ?? null;
        }
        if (n.type === 'repo') {
          const tid = nodeTeamId[n.id];
          return tid && expandedTeams.value.has(tid) ? tid : null;
        }
        return null;
      }

      const cx = {}, cy = {}, cnt = {};
      for (const n of nodes) {
        if (n.x == null) continue;
        const tid = nodeTeam(n);
        if (!tid) continue;
        cx[tid]  = (cx[tid]  ?? 0) + n.x;
        cy[tid]  = (cy[tid]  ?? 0) + n.y;
        cnt[tid] = (cnt[tid] ?? 0) + 1;
      }
      for (const id in cnt) { cx[id] /= cnt[id]; cy[id] /= cnt[id]; }

      for (const n of nodes) {
        if (n.x == null) continue;
        const tid = nodeTeam(n);
        if (!tid || cx[tid] == null) continue;
        n.vx = (n.vx ?? 0) + (cx[tid] - n.x) * k;
        n.vy = (n.vy ?? 0) + (cy[tid] - n.y) * k;
      }
    }

    // Radial layout: authors inner → repos middle → teams outer.
    const R = Math.min(w, h) * cfg.ringScale + nodes.length * cfg.nodeSpacing;
    const hasIndividuals = nodes.some(n => n.type === 'author' || n.type === 'repo');

    sim = d3.forceSimulation(nodes)
      .force('link',    d3.forceLink(links).id(d => d.id)
        .distance(d => (d.source.type === 'team' || d.target.type === 'team') ? cfg.teamLinkDistance : cfg.linkDistance)
        .strength(cfg.linkStrength))
      .force('charge',  d3.forceManyBody().strength(d => d.type === 'team' ? cfg.teamCharge : cfg.charge))
      .force('center',  d3.forceCenter(w / 2, h / 2).strength(0.08))
      .force('radial',  d3.forceRadial(d => {
        if (d.type === 'team')   return hasIndividuals ? R : R * 0.75;
        if (d.type === 'author') return R * 0.35;
        return R * 0.65;
      }, w / 2, h / 2).strength(cfg.radialStrength))
      .force('collide', d3.forceCollide(d => d.r + (d.type === 'team' ? cfg.teamCollide : cfg.collide)))
      .force('teamGravity', teamGravity);

    simNodes   = nodes;
    cloudGroup = root.append('g').attr('class', 'team-clouds').attr('pointer-events', 'none');

    linkEls = root.append('g')
      .selectAll('path').data(links).join('path')
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow)')
      .style('cursor', 'default')
      .on('mouseenter', (e, d) => {
        highlightLink(d);
        onShowLinkTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => { onMoveTooltip(e.clientX + 14, e.clientY - 10); })
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    updateEdgeStyles();

    nodeEls = root.append('g')
      .selectAll('g').data(nodes).join('g')
      .style('cursor', d => isNodeExpandable(d) ? 'pointer' : 'grab')
      .call(d3.drag()
        .on('start', (e, d) => {
          d._moved = false;
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (e, d) => {
          d._moved = true;
          d.fx = e.x; d.fy = e.y;
        })
        .on('end', (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      )
      .on('click', (e, d) => {
        if (d._moved) { d._moved = false; return; }
        handleNodeClick(d);
      })
      .on('mouseenter', (e, d) => {
        highlightNode(d);
        onShowNodeTooltip(d, e.clientX + 14, e.clientY - 10);
      })
      .on('mousemove',  e => { onMoveTooltip(e.clientX + 14, e.clientY - 10); })
      .on('mouseleave', () => { resetHighlight(); onHideTooltip(); });

    // Author nodes — circles
    nodeEls.filter(d => d.type === 'author')
      .append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => getNodeColor(d.id, 'author'))
      .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

    // Repo nodes — squares
    nodeEls.filter(d => d.type === 'repo')
      .append('rect')
      .attr('x', d => -d.r).attr('y', d => -d.r)
      .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
      .attr('rx', 4)
      .attr('fill', d => getNodeColor(d.id, 'repo'))
      .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

    // Team nodes — wide pill / rounded rectangle
    nodeEls.filter(d => d.type === 'team')
      .append('rect')
      .attr('x', d => -(d.r + 14)).attr('y', d => -d.r)
      .attr('width', d => (d.r + 14) * 2).attr('height', d => d.r * 2)
      .attr('rx', d => d.r)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff').attr('stroke-width', 3).attr('opacity', 0.95);

    // Team node label (centered, white)
    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.15em')
      .attr('fill', '#fff').attr('font-size', '13px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.name);

    // Team node sub-label
    nodeEls.filter(d => d.type === 'team')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.1em')
      .attr('fill', 'rgba(255,255,255,0.75)').attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text(d => `${d.repoCount} ${d.repoCount === 1 ? 'repo' : 'repos'} · ${d.authorCount} ${d.authorCount === 1 ? 'dev' : 'devs'}`);

    // Expand/collapse badge on clickable non-author nodes (+ or −)
    nodeEls.filter(d => isNodeExpandable(d))
      .append('circle')
      .attr('cx', d => d.type === 'team' ? d.r + 10 : d.r * 0.65)
      .attr('cy', d => d.type === 'team' ? -d.r      : -d.r * 0.65)
      .attr('r', 8)
      .attr('fill', d => isNodeExpanded(d) ? '#F08223' : '#22c55e')
      .attr('stroke', '#fff').attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    nodeEls.filter(d => isNodeExpandable(d))
      .append('text')
      .attr('x', d => d.type === 'team' ? d.r + 10 : d.r * 0.65)
      .attr('y', d => d.type === 'team' ? -d.r      : -d.r * 0.65)
      .attr('text-anchor', 'middle').attr('dy', '0.38em')
      .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => isNodeExpanded(d) ? '−' : '+');

    // Text labels below nodes (all types except team, which has inline labels)
    nodeEls.filter(d => d.type !== 'team')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.r + 13)
      .attr('fill', '#374151').attr('font-size', '11px').attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => d.type === 'author' ? anonymize(d.id) : d.id);

    sim.on('tick', () => {
      nodes.forEach(n => { if (n.x != null) savedPositions[n.id] = { x: n.x, y: n.y }; });

      linkEls.each(function(d) {
        const dx  = d.target.x - d.source.x;
        const dy  = d.target.y - d.source.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux  = dx / len, uy = dy / len;

        const srcOffset = d.source.type === 'author'
          ? d.source.r + 3
          : d.source.type === 'team'
            ? squareEdgeDist(ux, uy, d.source.r + 14)
            : squareEdgeDist(ux, uy, d.source.r) + 2;

        const tgtOffset = d.target.type === 'author'
          ? d.target.r + 3
          : d.target.type === 'team'
            ? squareEdgeDist(ux, uy, d.target.r + 14)
            : squareEdgeDist(ux, uy, d.target.r) + 2;

        const x1 = d.source.x + ux * srcOffset;
        const y1 = d.source.y + uy * srcOffset;
        const x2 = d.target.x - ux * tgtOffset;
        const y2 = d.target.y - uy * tgtOffset;

        let pathD;
        if (d.curvature) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const CURVE = 50;
          pathD = `M${x1},${y1} Q${mx - uy * CURVE * d.curvature},${my + ux * CURVE * d.curvature} ${x2},${y2}`;
        } else {
          pathD = `M${x1},${y1} L${x2},${y2}`;
        }
        d3.select(this).attr('d', pathD);
      });

      nodeEls.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      drawOverlays();
    });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  function teardown() {
    if (sim) { sim.stop(); sim = null; }
    nodeEls    = null;
    linkEls    = null;
    cloudGroup = null;
    simNodes   = null;
  }

  return { draw, updateEdgeStyles, updateNodeColors, drawOverlays, teardown };
}
