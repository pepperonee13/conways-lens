<template>
  <div class="graph-wrap" ref="containerRef">
    <div class="graph-header">
      <h3 class="graph-title">Contribution Network</h3>
      <div class="graph-desc-row">
        <p class="graph-desc">
          <span class="legend"><span class="legend-circle"></span>Author</span>
          <span class="legend"><span class="legend-square"></span>Repository</span>
          <span class="legend"><span class="legend-team"></span>Team</span>
          &nbsp;·&nbsp; Node size = total commits &nbsp;·&nbsp; Drag nodes · Click team to expand/collapse
        </p>
        <button v-if="effectiveTeams.length > 0"
                @click="store.crossTeamOnly = !store.crossTeamOnly"
                :class="['cross-team-btn', { active: crossTeamOnly }]">
          <span class="btn-dot"></span>
          Cross-team only
        </button>
        <div class="viz-dropdown-wrap" ref="vizDropRef">
          <button :class="['cross-team-btn', { active: edgeWeight }]" @click="vizOpen = !vizOpen">
            <span class="btn-dot"></span>
            Visualization
            <span class="viz-chevron">{{ vizOpen ? '▴' : '▾' }}</span>
          </button>
          <div v-if="vizOpen" class="viz-panel">
            <template v-if="effectiveTeams.length > 0">
              <div class="viz-row">
                <span class="viz-row-label">Edge weight</span>
                <button :class="['viz-toggle-btn', { active: edgeWeight }]" @click="edgeWeight = !edgeWeight">
                  {{ edgeWeight ? 'On' : 'Off' }}
                </button>
              </div>
              <p class="viz-desc">Color = source team &nbsp;·&nbsp; Width = commit volume</p>
              <div class="viz-divider"></div>
              <div class="viz-row">
                <span class="viz-row-label">Show authors</span>
                <button :class="['viz-toggle-btn', { active: showAuthors }]" @click="showAuthors = !showAuthors">
                  {{ showAuthors ? 'On' : 'Off' }}
                </button>
              </div>
              <p class="viz-desc">Individual author nodes &amp; edges</p>
              <div class="viz-divider"></div>
            </template>

            <div class="viz-section-title">Physics</div>

            <div class="viz-row">
              <span class="viz-row-label">Ring scale</span>
              <span class="viz-val">{{ simConfig.ringScale.toFixed(2) }}</span>
            </div>
            <input type="range" class="viz-slider" min="0.1" max="0.8" step="0.01"
                   v-model.number="simConfig.ringScale" />

            <div class="viz-row">
              <span class="viz-row-label">Spread</span>
              <span class="viz-val">{{ simConfig.nodeSpacing }}</span>
            </div>
            <input type="range" class="viz-slider" min="1" max="20" step="1"
                   v-model.number="simConfig.nodeSpacing" />

            <div class="viz-row">
              <span class="viz-row-label">Repulsion</span>
              <span class="viz-val">{{ -simConfig.charge }}</span>
            </div>
            <input type="range" class="viz-slider" min="100" max="2000" step="50"
                   :value="-simConfig.charge"
                   @input="e => { simConfig.charge = -e.target.value; simConfig.teamCharge = -e.target.value * 2.33 | 0; }" />

            <div class="viz-row">
              <span class="viz-row-label">Link distance</span>
              <span class="viz-val">{{ simConfig.linkDistance }}</span>
            </div>
            <input type="range" class="viz-slider" min="40" max="300" step="5"
                   :value="simConfig.linkDistance"
                   @input="e => { simConfig.linkDistance = +e.target.value; simConfig.teamLinkDistance = +e.target.value * 1.45 | 0; }" />

            <div class="viz-row">
              <span class="viz-row-label">Radial pull</span>
              <span class="viz-val">{{ simConfig.radialStrength.toFixed(2) }}</span>
            </div>
            <input type="range" class="viz-slider" min="0.02" max="0.5" step="0.01"
                   v-model.number="simConfig.radialStrength" />

            <button class="viz-reset-btn" @click="resetSimConfig">Reset</button>
          </div>
        </div>
      </div>
      <div v-if="dateBounds" class="date-filter-row">
        <span class="date-filter-label">Period</span>
        <input type="date" class="date-input"
               :min="dateBounds.since" :max="activeRange.until || dateBounds.until"
               :value="activeRange.since || dateBounds.since"
               @change="e => store.activeRange = { ...store.activeRange, since: e.target.value || null }" />
        <span class="date-sep">→</span>
        <input type="date" class="date-input"
               :min="activeRange.since || dateBounds.since" :max="dateBounds.until"
               :value="activeRange.until || dateBounds.until"
               @change="e => store.activeRange = { ...store.activeRange, until: e.target.value || null }" />
        <button v-if="activeRange.since || activeRange.until"
                class="date-reset-btn"
                @click="store.activeRange = { since: null, until: null }">
          Reset
        </button>
        <span v-else class="date-bounds-hint">{{ dateBounds.since }} – {{ dateBounds.until }}</span>
      </div>
    </div>

    <div v-if="!hasData" class="empty-state">No contribution data to display.</div>

    <template v-else>
      <p class="hint">Scroll to zoom · Drag nodes · Click team nodes to expand or collapse</p>
      <div class="svg-wrap">
        <svg ref="svgRef" class="graph-svg"></svg>
      </div>
    </template>

    <teleport to="body">
      <div v-if="tooltip.show" class="graph-tooltip"
           :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        <template v-if="tooltip.isLink">
          <div class="tt-name">{{ displayNodeName(tooltip.source) }} → {{ displayNodeName(tooltip.target) }}</div>
          <div class="tt-detail">{{ tooltip.commits.toLocaleString() }} commits</div>
        </template>
        <template v-else>
          <div class="tt-name">{{ tooltipName }}</div>
          <div class="tt-detail">{{ tooltipDetail }}</div>
          <div v-if="tooltip.action" class="tt-action">{{ tooltip.action }}</div>
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
import { useAnonymize } from '../composables/useAnonymize.js';

const store = useLensStore();
const { graphData, nodeColors, crossTeamOnly, dateBounds, activeRange, expandedTeams, syntheticTeam } = storeToRefs(store);

// Real teams + synthetic "Outside Contributors" team (when it exists)
const effectiveTeams = computed(() =>
  syntheticTeam.value ? [...store.teams, syntheticTeam.value] : store.teams
);
const { anonymize } = useAnonymize();

const svgRef       = ref(null);
const containerRef = ref(null);
const vizDropRef   = ref(null);
const dims         = reactive({ w: 900, h: 600 });

// Visualization panel state (ephemeral — not persisted)
const vizOpen     = ref(false);
const edgeWeight  = ref(true);
const showAuthors = ref(false);

// Force simulation config — all tunable values in one place, ready for UI binding
const SIM_DEFAULTS = {
  ringScale:        0.38,
  nodeSpacing:      5,
  linkDistance:     110,
  teamLinkDistance: 160,
  linkStrength:     0.4,
  charge:          -600,
  teamCharge:      -1400,
  radialStrength:   0.15,
  collide:          18,
  teamCollide:      40,
};
const simConfig = reactive({ ...SIM_DEFAULTS });
function resetSimConfig() { Object.assign(simConfig, SIM_DEFAULTS); }
const tooltip      = reactive({
  show: false, x: 0, y: 0,
  isLink: false,
  name: '', type: '', commits: 0,
  teamName: '', repoCount: 0, authorCount: 0,
  source: '', target: '', action: '',
});

const hasData = computed(() => graphData.value.nodes.length > 0);

const tooltipName = computed(() => {
  if (tooltip.type === 'author') return anonymize(tooltip.name);
  if (tooltip.type === 'team')   return tooltip.teamName;
  return tooltip.name;
});

const tooltipDetail = computed(() => {
  const c = tooltip.commits.toLocaleString();
  if (tooltip.type === 'author') return `Author · ${c} commits`;
  if (tooltip.type === 'team')   return `Team · ${tooltip.repoCount} ${tooltip.repoCount === 1 ? 'repo' : 'repos'} · ${tooltip.authorCount} ${tooltip.authorCount === 1 ? 'dev' : 'devs'} · ${c} commits`;
  return `Repository · ${c} commits`;
});

function displayNodeName(id) {
  if (!id) return '';
  if (id.startsWith('team:')) {
    const teamId = id.slice(5);
    const team = effectiveTeams.value.find(t => t.id === teamId);
    return team?.name ?? id;
  }
  return anonymize(id);
}

const EDGE_COLOR    = '#94a3b8';
const EDGE_OPACITY  = 0.5;
const EDGE_HL_COLOR = '#225EA9';
const DIM_OPACITY   = 0.08;

const savedPositions = {};

let nodeEls      = null;
let linkEls      = null;
let anchorEls    = null;
let sim          = null;
let nodeTeamId   = {}; // nodeId → teamId  (rebuilt each drawGraph)
let nodeTeamColor = {}; // nodeId → hex color

function squareEdgeDist(ux, uy, r) {
  const tx = Math.abs(ux) > 1e-9 ? r / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? r / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

// ── Edge weight helpers ──────────────────────────────────────────────────────

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
  if (!srcTeam || !tgtTeam) return EDGE_OPACITY; // no team context — show at normal opacity
  return (srcTeam !== tgtTeam) ? 0.75 : 0.18;
}

function updateEdgeStyles() {
  if (!linkEls) return;
  linkEls
    .attr('stroke',         d => edgeWeight.value ? edgeSrcColor(d)        : EDGE_COLOR)
    .attr('stroke-width',   d => edgeStrokeWidth(d))
    .attr('stroke-opacity', d => edgeStrokeOpacity(d));
}

// ────────────────────────────────────────────────────────────────────────────

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

function updateNodeColors() {
  if (!nodeEls) return;
  nodeEls.filter(d => d.type === 'author').select('circle').attr('fill', d => store.getNodeColor(d.id, 'author'));
  nodeEls.filter(d => d.type === 'repo')  .select('rect')  .attr('fill', d => store.getNodeColor(d.id, 'repo'));
}


function isNodeExpandable(d) {
  return d.type === 'team';
}

function isNodeExpanded(d) {
  return expandedTeams.value.has(d.teamId);
}

function handleNodeClick(d) {
  if (d.type === 'team') store.toggleTeamExpansion(d.teamId);
}

function drawGraph() {
  if (!svgRef.value || !hasData.value) return;
  if (sim) { sim.stop(); sim = null; }

  let { nodes: rawNodes, links: rawLinks } = graphData.value;
  const { w, h } = dims;

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

  const aScale    = d3.scaleSqrt().domain([0, authMax]).range([13, 40]);
  const otherScale = d3.scaleSqrt().domain([0, nonAuthMax]).range([14, 40]);
  // Team nodes are larger
  const teamScale = d3.scaleSqrt().domain([0, nonAuthMax]).range([28, 55]);

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
  // Both directions use curvature = 1 — when the edge is reversed ux/uy negate
  // naturally, so the perpendicular offset lands on opposite sides of the midpoint.
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

  const root = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => root.attr('transform', e.transform)));

  // Build lookup: author → their teams (for gravity and hull rendering)
  const authorToTeamsMap = {};
  for (const t of effectiveTeams.value) {
    for (const a of (t.authors ?? [])) {
      if (!authorToTeamsMap[a]) authorToTeamsMap[a] = [];
      authorToTeamsMap[a].push(t);
    }
  }

  // Team gravity: cluster author nodes toward their team centroid, only for expanded teams
  function teamGravity(alpha) {
    if (!hasTeams) return;
    const cx = {}, cy = {}, cnt = {};
    for (const n of nodes) {
      if (n.type !== 'author' || n.x == null) continue;
      const myTeams = (authorToTeamsMap[n.id] ?? []).filter(t => expandedTeams.value.has(t.id));
      if (myTeams.length === 0) continue;
      const t = myTeams[0];
      cx[t.id]  = (cx[t.id]  ?? 0) + n.x;
      cy[t.id]  = (cy[t.id]  ?? 0) + n.y;
      cnt[t.id] = (cnt[t.id] ?? 0) + 1;
    }
    for (const id in cnt) { cx[id] /= cnt[id]; cy[id] /= cnt[id]; }
    const k = 0.08 * alpha;
    for (const n of nodes) {
      if (n.type !== 'author') continue;
      const myTeams = (authorToTeamsMap[n.id] ?? []).filter(t => expandedTeams.value.has(t.id));
      if (myTeams.length === 0) continue;
      const t = myTeams[0];
      if (cx[t.id] == null) continue;
      n.vx = (n.vx ?? 0) + (cx[t.id] - (n.x ?? 0)) * k;
      n.vy = (n.vy ?? 0) + (cy[t.id] - (n.y ?? 0)) * k;
    }
  }

  // Radial layout: authors inner → repos middle → teams outer.
  // R grows with node count to keep the rings from getting cramped.
  const cfg = simConfig;
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

  linkEls = root.append('g')
    .selectAll('path').data(links).join('path')
    .attr('fill', 'none')
    .attr('marker-end', 'url(#arrow)')
    .style('cursor', 'default')
    .on('mouseenter', (e, d) => {
      highlightLink(d);
      Object.assign(tooltip, {
        show: true, x: e.clientX + 14, y: e.clientY - 10,
        isLink: true,
        source: d.source.id, target: d.target.id, commits: d.commits,
      });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { resetHighlight(); tooltip.show = false; });

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
      const action = d.type === 'team'
        ? (expandedTeams.value.has(d.teamId) ? 'Click to collapse' : 'Click to expand')
        : '';
      Object.assign(tooltip, {
        show: true, x: e.clientX + 14, y: e.clientY - 10,
        isLink: false,
        name: d.id, type: d.type, commits: d.commits,
        teamName: d.name ?? '', repoCount: d.repoCount ?? 0, authorCount: d.authorCount ?? 0,
        action,
      });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { resetHighlight(); tooltip.show = false; });

  // Author nodes — circles
  nodeEls.filter(d => d.type === 'author')
    .append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => store.getNodeColor(d.id, 'author'))
    .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

  // Repo nodes — squares
  nodeEls.filter(d => d.type === 'repo')
    .append('rect')
    .attr('x', d => -d.r).attr('y', d => -d.r)
    .attr('width', d => d.r * 2).attr('height', d => d.r * 2)
    .attr('rx', 4)
    .attr('fill', d => store.getNodeColor(d.id, 'repo'))
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

  // Anchor pills for expanded teams — float at centroid, click to collapse
  const PILL_H = 28;
  const expandedTeamData = effectiveTeams.value.filter(t => expandedTeams.value.has(t.id));

  anchorEls = root.append('g').attr('class', 'team-anchors')
    .selectAll('g').data(expandedTeamData, d => d.id).join('g')
    .style('cursor', 'pointer')
    .on('click', (e, t) => { e.stopPropagation(); store.toggleTeamExpansion(t.id); })
    .on('mouseenter', (e, t) => {
      Object.assign(tooltip, {
        show: true, x: e.clientX + 14, y: e.clientY - 10,
        isLink: false,
        name: `team:${t.id}`, type: 'team', commits: 0,
        teamName: t.name,
        repoCount: (t.repos ?? []).length,
        authorCount: (t.authors ?? []).length,
        action: 'Click to collapse',
      });
    })
    .on('mousemove', e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { tooltip.show = false; });

  anchorEls.each(function(t) {
    const g     = d3.select(this);
    const pillW = Math.max(80, t.name.length * 7.5 + 40);

    g.append('rect')
      .attr('x', -pillW / 2).attr('y', -PILL_H / 2)
      .attr('width', pillW).attr('height', PILL_H)
      .attr('rx', PILL_H / 2)
      .attr('fill', t.color || '#225EA9')
      .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.92);

    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(t.name);

    // Minus badge — top-right corner of pill
    g.append('circle')
      .attr('cx', pillW / 2).attr('cy', -PILL_H / 2)
      .attr('r', 8).attr('fill', '#F08223')
      .attr('stroke', '#fff').attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    g.append('text')
      .attr('x', pillW / 2).attr('y', -PILL_H / 2)
      .attr('text-anchor', 'middle').attr('dy', '0.38em')
      .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text('−');
  });

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

    // Float each anchor pill above the topmost node of its team's cluster
    if (anchorEls) {
      anchorEls.attr('transform', function(t) {
        const authorIds = new Set(t.authors ?? []);
        const repoIds   = new Set(t.repos   ?? []);
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue;
          if (
            (n.type === 'author' && authorIds.has(n.id)) ||
            (n.type === 'repo'   && repoIds.has(n.id))
          ) {
            minX = Math.min(minX, n.x);
            maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y - (n.r ?? 20));
          }
        }
        if (minX === Infinity) return 'translate(-9999,-9999)';
        return `translate(${(minX + maxX) / 2},${minY - 22})`;
      });
    }
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

watch(graphData,    () => drawGraph(), { deep: true });
watch(nodeColors,   () => updateNodeColors());
watch(dims,         () => drawGraph());
watch(edgeWeight,   () => updateEdgeStyles());
watch(showAuthors,  () => drawGraph());
watch(simConfig,    () => drawGraph(), { deep: true });

function handleDocClick(e) {
  if (vizOpen.value && vizDropRef.value && !vizDropRef.value.contains(e.target))
    vizOpen.value = false;
}

onMounted(() => {
  updateSize();
  const onResize = debounce(updateSize, 150);
  window.addEventListener('resize', onResize);
  document.addEventListener('mousedown', handleDocClick);
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('mousedown', handleDocClick);
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
.legend        { @apply flex items-center gap-1.5 font-medium; }
.legend-circle { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #225EA9; }
.legend-square { display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: #088F9B; }
.legend-team   {
  display: inline-block; width: 22px; height: 12px; border-radius: 6px; background: #F08223;
}
.date-filter-row {
  @apply flex items-center justify-center gap-2 mt-3 flex-wrap;
}
.date-filter-label {
  @apply text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1;
}
.date-input {
  @apply text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white
         focus:outline-none focus:ring-2 focus:border-brand-blue transition-all;
  font-family: 'JetBrains Mono', monospace;
  --tw-ring-color: #225EA933;
}
.date-sep { @apply text-gray-400 text-sm font-medium; }
.date-reset-btn {
  @apply text-xs px-2.5 py-1 rounded-lg border border-brand-orange text-brand-orange
         hover:bg-brand-orange hover:text-white transition-all duration-150 cursor-pointer;
  background: transparent;
}
.date-bounds-hint { @apply text-xs text-gray-300 font-mono ml-1; }
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
.tt-action { @apply text-brand-blue text-xs mt-1 font-medium; }

/* ── Visualization dropdown ── */
.viz-dropdown-wrap { position: relative; }
.viz-chevron       { font-size: 9px; margin-left: 3px; }
.viz-panel {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 200;
  background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10); padding: 10px 14px 8px; min-width: 240px;
  animation: fadeIn 0.12s ease-out;
}
.viz-row       { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.viz-row-label { font-size: 13px; font-weight: 600; color: #374151; }
.viz-toggle-btn {
  font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 999px;
  border: 1.5px solid #94a3b8; color: #64748b; background: transparent; cursor: pointer;
  transition: all 0.15s;
}
.viz-toggle-btn.active { background: #225EA9; border-color: #225EA9; color: #fff; }
.viz-desc         { font-size: 10px; color: #9ca3af; margin: 6px 0 0; text-align: center; }
.viz-divider      { height: 1px; background: #e2e8f0; margin: 10px 0 8px; }
.viz-section-title { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin: 4px 0 6px; }
.viz-val          { font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #225EA9; min-width: 36px; text-align: right; }
.viz-slider {
  width: 100%; margin: 2px 0 8px;
  height: 4px; border-radius: 2px; appearance: none; cursor: pointer;
  accent-color: #088F9B;
}
.viz-reset-btn {
  margin-top: 4px; width: 100%; padding: 4px 0; border-radius: 6px;
  font-size: 11px; font-weight: 600; color: #64748b;
  border: 1px solid #e2e8f0; background: transparent; cursor: pointer;
}
.viz-reset-btn:hover { border-color: #225EA9; color: #225EA9; }
</style>
