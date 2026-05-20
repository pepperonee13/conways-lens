<template>
  <div class="graph-wrap" ref="containerRef">
    <div class="graph-header">
      <h3 class="graph-title">Contribution Network</h3>
      <p class="graph-desc">
        <span class="legend"><span class="legend-circle"></span>Author</span>
        <span class="legend"><span class="legend-square"></span>Repository</span>
        &nbsp;·&nbsp; Arrow width = commit count &nbsp;·&nbsp; Node size = total commits
        &nbsp;·&nbsp; Nodes are draggable
      </p>
    </div>

    <div v-if="!hasData" class="empty-state">
      No contribution data to display.
    </div>

    <template v-else>
      <p class="hint">Drag nodes · Scroll to zoom · Hover for details</p>
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

const { graphData } = storeToRefs(useLensStore());

const svgRef       = ref(null);
const containerRef = ref(null);
const dims         = reactive({ w: 900, h: 600 });
const tooltip      = reactive({ show: false, x: 0, y: 0, isLink: false, name: '', type: '', commits: 0, source: '', target: '' });

const hasData = computed(() => graphData.value.nodes.length > 0);

const AUTHOR_COLOR = '#225EA9';
const REPO_COLOR   = '#088F9B';

let sim = null;

// Distance from the center of a square node (half-side = r) to its edge
// along unit direction (ux, uy).
function squareEdgeDist(ux, uy, r) {
  const tx = Math.abs(ux) > 1e-9 ? r / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? r / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

function drawGraph() {
  if (!svgRef.value || !hasData.value) return;
  if (sim) { sim.stop(); sim = null; }

  const { nodes: rawNodes, links: rawLinks } = graphData.value;
  const { w, h } = dims;

  // Scale node radius by commit volume
  const authMax = d3.max(rawNodes.filter(n => n.type === 'author'), n => n.commits) || 1;
  const repoMax = d3.max(rawNodes.filter(n => n.type === 'repo'),   n => n.commits) || 1;
  const aScale  = d3.scaleSqrt().domain([0, authMax]).range([13, 40]);
  const rScale  = d3.scaleSqrt().domain([0, repoMax]).range([12, 36]);

  const nodes = rawNodes.map(n => ({ ...n, r: n.type === 'author' ? aScale(n.commits) : rScale(n.commits) }));
  const links = rawLinks.map(l => ({ ...l }));

  const maxCommits = d3.max(links, l => l.commits) || 1;
  const wScale     = d3.scaleSqrt().domain([0, maxCommits]).range([1, 7]);

  // --- SVG setup ---
  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();
  svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
    .attr('markerWidth', 8).attr('markerHeight', 8)
    .attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#94a3b8');

  const root = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => root.attr('transform', e.transform)));

  // --- Simulation ---
  sim = d3.forceSimulation(nodes)
    .force('link',    d3.forceLink(links).id(d => d.id).distance(200).strength(0.45))
    .force('charge',  d3.forceManyBody().strength(-700))
    .force('center',  d3.forceCenter(w / 2, h / 2).strength(0.05))
    .force('x',       d3.forceX(d => d.type === 'author' ? w * 0.27 : w * 0.73).strength(0.09))
    .force('collide', d3.forceCollide(d => d.r + 20));

  // --- Links ---
  const linkEls = root.append('g')
    .selectAll('line').data(links).join('line')
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', d => wScale(d.commits))
    .attr('stroke-opacity', 0.5)
    .attr('marker-end', 'url(#arrow)')
    .style('cursor', 'default')
    .on('mouseenter', (e, d) => {
      d3.select(e.currentTarget).attr('stroke', '#225EA9').attr('stroke-opacity', 0.9);
      Object.assign(tooltip, { show: true, x: e.clientX + 14, y: e.clientY - 10, isLink: true, source: d.source.id ?? d.source, target: d.target.id ?? d.target, commits: d.commits });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', e => { d3.select(e.currentTarget).attr('stroke', '#94a3b8').attr('stroke-opacity', 0.5); tooltip.show = false; });

  // --- Nodes ---
  const nodeEls = root.append('g')
    .selectAll('g').data(nodes).join('g')
    .style('cursor', 'grab')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on('mouseenter', (e, d) => {
      Object.assign(tooltip, { show: true, x: e.clientX + 14, y: e.clientY - 10, isLink: false, name: d.id, type: d.type, commits: d.commits });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { tooltip.show = false; });

  // Author = circle
  nodeEls.filter(d => d.type === 'author')
    .append('circle')
    .attr('r', d => d.r)
    .attr('fill', AUTHOR_COLOR).attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

  // Repo = square
  nodeEls.filter(d => d.type === 'repo')
    .append('rect')
    .attr('x', d => -d.r).attr('y', d => -d.r)
    .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
    .attr('rx', 4)
    .attr('fill', REPO_COLOR).attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

  // Label below node
  nodeEls.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.r + 13)
    .attr('fill', '#374151').attr('font-size', '11px').attr('font-weight', '600')
    .attr('pointer-events', 'none')
    .text(d => d.id);

  // --- Tick ---
  sim.on('tick', () => {
    linkEls
      .each(function(d) {
        const sx = d.source.x, sy = d.source.y;
        const tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;

        // Start just outside source circle
        const x1 = sx + ux * (d.source.r + 3);
        const y1 = sy + uy * (d.source.r + 3);

        // End at target square edge (arrow tip lands here)
        const edgeDist = squareEdgeDist(ux, uy, d.target.r);
        const x2 = tx - ux * edgeDist;
        const y2 = ty - uy * edgeDist;

        d3.select(this).attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      });

    nodeEls.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function updateSize() {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  dims.w = Math.max(500, rect.width  - 48);
  dims.h = Math.max(400, Math.min(800, dims.w * 0.65));
  drawGraph();
}

watch(graphData, () => drawGraph(), { deep: true });
watch(dims,      () => drawGraph());

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
.graph-header { @apply mb-4 text-center; }
.graph-title  { @apply text-2xl font-bold text-brand-gray mb-2; }
.graph-desc   { @apply text-sm text-gray-500 leading-relaxed flex items-center justify-center flex-wrap gap-x-2 gap-y-1; }
.legend       { @apply flex items-center gap-1.5 font-medium; }
.legend-circle {
  display: inline-block; width: 12px; height: 12px; border-radius: 50%;
  background: #225EA9;
}
.legend-square {
  display: inline-block; width: 12px; height: 12px; border-radius: 2px;
  background: #088F9B;
}
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
