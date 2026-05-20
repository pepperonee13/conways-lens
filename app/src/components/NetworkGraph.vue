<template>
  <div class="graph-wrap" ref="containerRef">
    <div class="graph-header">
      <h3 class="graph-title">Contribution Network</h3>
      <div class="graph-desc-row">
        <p class="graph-desc">
          <span class="legend"><span class="legend-circle"></span>Author</span>
          <span class="legend"><span class="legend-square"></span>Repository</span>
          &nbsp;·&nbsp; Node size = total commits &nbsp;·&nbsp; Nodes are draggable
        </p>
        <button v-if="store.teams.length > 0"
                @click="store.crossTeamOnly = !store.crossTeamOnly"
                :class="['cross-team-btn', { active: crossTeamOnly }]">
          <span class="btn-dot"></span>
          Cross-team only
        </button>
      </div>
    </div>

    <div v-if="!hasData" class="empty-state">No contribution data to display.</div>

    <template v-else>
      <p class="hint">Drag nodes · Scroll to zoom · Hover to highlight connections</p>
      <div class="svg-wrap">
        <svg ref="svgRef" class="graph-svg"></svg>
      </div>
    </template>

    <teleport to="body">
      <div v-if="tooltip.show" class="graph-tooltip"
           :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        <template v-if="tooltip.isLink">
          <div class="tt-name">{{ tooltip.source }} → {{ tooltip.target }}</div>
          <div class="tt-detail">{{ tooltip.commits.toLocaleString() }} commits</div>
        </template>
        <template v-else>
          <div class="tt-name">{{ tooltip.name }}</div>
          <div class="tt-detail">
            {{ tooltip.type === 'author' ? 'Author' : 'Repository' }}
            · {{ tooltip.commits.toLocaleString() }} commits
          </div>
        </template>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import { useLensStore } from '../stores/useLensStore';

const store = useLensStore();
const { graphData, nodeColors, crossTeamOnly } = storeToRefs(store);

const svgRef       = ref(null);
const containerRef = ref(null);
const dims         = reactive({ w: 900, h: 600 });
const tooltip      = reactive({ show: false, x: 0, y: 0, isLink: false, name: '', type: '', commits: 0, source: '', target: '' });

const hasData = computed(() => graphData.value.nodes.length > 0);

const EDGE_COLOR    = '#94a3b8';
const EDGE_OPACITY  = 0.5;
const EDGE_HL_COLOR = '#225EA9';
const DIM_OPACITY   = 0.08;

// Persist node positions across redraws so layout stays stable
const savedPositions = {};

// D3 selections kept alive for lightweight color-only updates
let nodeEls = null;
let linkEls = null;
let sim     = null;

function squareEdgeDist(ux, uy, r) {
  const tx = Math.abs(ux) > 1e-9 ? r / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? r / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

function highlightNode(d) {
  const connected = new Set([d.id]);
  linkEls.each(l => {
    const s = l.source.id, t = l.target.id;
    if (s === d.id || t === d.id) { connected.add(s); connected.add(t); }
  });
  nodeEls.attr('opacity', n => connected.has(n.id) ? 1 : DIM_OPACITY);
  linkEls
    .attr('stroke',         l => (l.source.id === d.id || l.target.id === d.id) ? EDGE_HL_COLOR : EDGE_COLOR)
    .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.9 : DIM_OPACITY);
}

function highlightLink(d) {
  const s = d.source.id, t = d.target.id;
  nodeEls.attr('opacity', n => (n.id === s || n.id === t) ? 1 : DIM_OPACITY);
  linkEls
    .attr('stroke',         l => l === d ? EDGE_HL_COLOR : EDGE_COLOR)
    .attr('stroke-opacity', l => l === d ? 0.9 : DIM_OPACITY);
}

function resetHighlight() {
  if (!nodeEls || !linkEls) return;
  nodeEls.attr('opacity', 1);
  linkEls.attr('stroke', EDGE_COLOR).attr('stroke-opacity', EDGE_OPACITY);
}

function updateNodeColors() {
  if (!nodeEls) return;
  nodeEls.filter(d => d.type === 'author').select('circle').attr('fill', d => store.getNodeColor(d.id, 'author'));
  nodeEls.filter(d => d.type === 'repo')  .select('rect')  .attr('fill', d => store.getNodeColor(d.id, 'repo'));
}

function teamHullPath(pts, padding = 38) {
  const samples = [];
  const ANGLES = 10;
  for (const [x, y, r] of pts) {
    const rad = (r ?? 20) + padding;
    for (let i = 0; i < ANGLES; i++) {
      const a = (i / ANGLES) * Math.PI * 2;
      samples.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
    }
  }
  const hull = d3.polygonHull(samples);
  return hull ? `M${hull.join('L')}Z` : null;
}

function buildNodeTeamMap() {
  const map = {};
  for (const team of store.teams) {
    for (const a of (team.authors ?? [])) map[`author:${a}`] = team;
    for (const r of (team.repos   ?? [])) map[`repo:${r}`]   = team;
  }
  return map;
}

function drawGraph() {
  if (!svgRef.value || !hasData.value) return;
  if (sim) { sim.stop(); sim = null; }

  const { nodes: rawNodes, links: rawLinks } = graphData.value;
  const { w, h } = dims;

  const authMax = d3.max(rawNodes.filter(n => n.type === 'author'), n => n.commits) || 1;
  const repoMax = d3.max(rawNodes.filter(n => n.type === 'repo'),   n => n.commits) || 1;
  const aScale  = d3.scaleSqrt().domain([0, authMax]).range([13, 40]);
  const rScale  = d3.scaleSqrt().domain([0, repoMax]).range([12, 36]);

  const nodes = rawNodes.map(n => {
    const saved = savedPositions[n.id];
    return { ...n, r: n.type === 'author' ? aScale(n.commits) : rScale(n.commits), x: saved?.x, y: saved?.y };
  });
  const links = rawLinks.map(l => ({ ...l }));

  const nodeTeamMap = buildNodeTeamMap();
  const hasTeams = store.teams.length > 0;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();
  svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

  svg.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
    .attr('markerWidth', 8).attr('markerHeight', 8)
    .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', EDGE_COLOR);

  const root = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => root.attr('transform', e.transform)));

  // Hull group rendered first so it sits behind nodes
  const hullGroup = root.append('g').attr('class', 'team-hulls');

  // Team gravity: nudge nodes toward their team centroid
  function teamGravity(alpha) {
    if (!hasTeams) return;
    const cx = {}, cy = {}, cnt = {};
    for (const n of nodes) {
      const t = nodeTeamMap[`${n.type}:${n.id}`];
      if (!t || n.x == null) continue;
      cx[t.id]  = (cx[t.id]  ?? 0) + n.x;
      cy[t.id]  = (cy[t.id]  ?? 0) + n.y;
      cnt[t.id] = (cnt[t.id] ?? 0) + 1;
    }
    for (const id in cnt) { cx[id] /= cnt[id]; cy[id] /= cnt[id]; }
    const k = 0.08 * alpha;
    for (const n of nodes) {
      const t = nodeTeamMap[`${n.type}:${n.id}`];
      if (!t || cx[t.id] == null) continue;
      n.vx = (n.vx ?? 0) + (cx[t.id] - (n.x ?? 0)) * k;
      n.vy = (n.vy ?? 0) + (cy[t.id] - (n.y ?? 0)) * k;
    }
  }

  sim = d3.forceSimulation(nodes)
    .force('link',        d3.forceLink(links).id(d => d.id).distance(200).strength(0.45))
    .force('charge',      d3.forceManyBody().strength(-700))
    .force('center',      d3.forceCenter(w / 2, h / 2).strength(0.05))
    .force('x',           d3.forceX(d => d.type === 'author' ? w * 0.27 : w * 0.73).strength(0.09))
    .force('collide',     d3.forceCollide(d => d.r + 20))
    .force('teamGravity', teamGravity);

  linkEls = root.append('g')
    .selectAll('line').data(links).join('line')
    .attr('stroke', EDGE_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', EDGE_OPACITY)
    .attr('marker-end', 'url(#arrow)')
    .style('cursor', 'default')
    .on('mouseenter', (e, d) => {
      highlightLink(d);
      Object.assign(tooltip, { show: true, x: e.clientX + 14, y: e.clientY - 10, isLink: true, source: d.source.id, target: d.target.id, commits: d.commits });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { resetHighlight(); tooltip.show = false; });

  nodeEls = root.append('g')
    .selectAll('g').data(nodes).join('g')
    .style('cursor', 'grab')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on('mouseenter', (e, d) => {
      highlightNode(d);
      Object.assign(tooltip, { show: true, x: e.clientX + 14, y: e.clientY - 10, isLink: false, name: d.id, type: d.type, commits: d.commits });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { resetHighlight(); tooltip.show = false; });

  nodeEls.filter(d => d.type === 'author')
    .append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => store.getNodeColor(d.id, 'author'))
    .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

  nodeEls.filter(d => d.type === 'repo')
    .append('rect')
    .attr('x', d => -d.r).attr('y', d => -d.r)
    .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
    .attr('rx', 4)
    .attr('fill', d => store.getNodeColor(d.id, 'repo'))
    .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

  nodeEls.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.r + 13)
    .attr('fill', '#374151').attr('font-size', '11px').attr('font-weight', '600')
    .attr('pointer-events', 'none')
    .text(d => d.id);

  sim.on('tick', () => {
    nodes.forEach(n => { if (n.x != null) savedPositions[n.id] = { x: n.x, y: n.y }; });

    // Update team hulls
    if (hasTeams) {
      const teamPtsMap = {};
      for (const n of nodes) {
        if (n.x == null) continue;
        const t = nodeTeamMap[`${n.type}:${n.id}`];
        if (!t) continue;
        (teamPtsMap[t.id] ??= { team: t, pts: [] }).pts.push([n.x, n.y, n.r]);
      }
      hullGroup.selectAll('path')
        .data(Object.values(teamPtsMap), d => d.team.id)
        .join('path')
        .attr('fill',         d => d.team.color + '18')
        .attr('stroke',       d => d.team.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4')
        .attr('stroke-opacity', 0.55)
        .attr('pointer-events', 'none')
        .attr('d', d => teamHullPath(d.pts));
    }

    linkEls.each(function(d) {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len, uy = dy / len;
      d3.select(this)
        .attr('x1', d.source.x + ux * (d.source.r + 3))
        .attr('y1', d.source.y + uy * (d.source.r + 3))
        .attr('x2', d.target.x - ux * squareEdgeDist(ux, uy, d.target.r))
        .attr('y2', d.target.y - uy * squareEdgeDist(ux, uy, d.target.r));
    });

    nodeEls.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function updateSize() {
  if (!containerRef.value) return;
  const r = containerRef.value.getBoundingClientRect();
  dims.w = Math.max(500, r.width - 48);
  dims.h = Math.max(400, Math.min(800, dims.w * 0.65));
  drawGraph();
}

watch(graphData,    () => drawGraph(),        { deep: true });
watch(nodeColors,   () => updateNodeColors());
watch(dims,         () => drawGraph());

onMounted(() => {
  updateSize();
  const onResize = debounce(updateSize, 150);
  window.addEventListener('resize', onResize);
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    if (sim) sim.stop();
  });
});
</script>

<style scoped>
.graph-wrap {
  @apply relative bg-white rounded-xl shadow-lg border-2 border-gray-100 p-6
         transition-all duration-300 hover:shadow-xl hover:border-brand-blue/30;
  animation: slideUp 0.4s ease-out;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.graph-header    { @apply mb-4 text-center; }
.graph-title     { @apply text-2xl font-bold text-brand-gray mb-2; }
.graph-desc-row  { @apply flex items-center justify-center gap-4 flex-wrap; }
.graph-desc      { @apply text-sm text-gray-500 leading-relaxed flex items-center flex-wrap gap-x-2 gap-y-1; }
.cross-team-btn  {
  @apply flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-150;
  border-color: #94a3b8; color: #64748b; background: transparent;
  cursor: pointer;
}
.cross-team-btn:hover { border-color: #225EA9; color: #225EA9; }
.cross-team-btn.active { background: #225EA9; border-color: #225EA9; color: #fff; }
.btn-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: currentColor; flex-shrink: 0;
}
.legend       { @apply flex items-center gap-1.5 font-medium; }
.legend-circle { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #225EA9; }
.legend-square { display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: #088F9B; }
.hint         { @apply text-xs text-gray-400 italic text-center mb-2; }
.svg-wrap     { overflow: auto; border-radius: 8px; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
.graph-svg    { display: block; }
.empty-state  { @apply flex items-center justify-center py-16 text-gray-400 text-base; }
.graph-tooltip {
  @apply fixed pointer-events-none bg-white rounded-xl shadow-2xl border-2 px-4 py-2.5 text-sm;
  border-color: #225EA9; z-index: 9999; min-width: 160px;
  animation: fadeIn 0.12s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tt-name   { @apply font-bold text-brand-gray text-base; }
.tt-detail { @apply text-gray-500 text-xs mt-0.5; }
</style>
