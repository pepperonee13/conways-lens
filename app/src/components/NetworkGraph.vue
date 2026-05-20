<template>
  <div class="network-container" :class="{ fullscreen: isFullscreen }" ref="containerRef">
    <div class="chart-header">
      <h3 class="chart-title">
        {{ isAutoMode ? 'Repository Contribution Network' : 'Cross-Team Contribution Network' }}
      </h3>
      <p v-if="!isFullscreen" class="chart-description">
        <template v-if="isAutoMode">
          Repositories are connected when contributors commit to both. Define teams in the Mapping panel to see cross-team boundaries.
        </template>
        <template v-else>
          Shows contributors committing to repositories owned by other teams.
        </template>
        Arrow width = commit volume · Badge = contributor count · Node size = own commits.
        Bidirectional edges are curved. Nodes are draggable.
      </p>
    </div>

    <div v-if="!hasLinks" class="empty-state">
      <span class="empty-icon">✅</span>
      <p v-if="isAutoMode">No shared contributors found between repositories — each author commits to exactly one repository.</p>
      <p v-else>No cross-team contributions found — all commits are within team boundaries.</p>
    </div>

    <template v-if="hasLinks">
      <transition name="banner">
        <div v-if="expandedTeam && !isAutoMode" class="drilldown-banner">
          <span>
            Drill-down:
            <strong :style="{ color: getTeamColor(expandedTeam) }">{{ expandedTeam }}</strong>
            — repositories with cross-team contributions
          </span>
          <button class="collapse-btn" @click="expandedTeam = null">← Team view</button>
        </div>
      </transition>

      <div class="toolbar-row">
        <button class="icon-btn" :class="{ active: showConfig }" @click="showConfig = !showConfig" title="Layout settings">
          ⚙
        </button>
        <button class="icon-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit fullscreen (ESC)' : 'Fullscreen'">
          <svg v-if="!isFullscreen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fs-icon"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fs-icon"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
        </button>
      </div>


      <div class="hint-row">🖱 Hover for details · Drag nodes to reposition · Scroll to zoom</div>

      <transition name="config-panel">
        <div v-if="showConfig" class="config-panel">
          <div class="config-grid">
            <div class="config-group">
              <h4 class="config-group-title">Distances</h4>
              <label class="config-label"><span>Team link distance</span><span class="config-val">{{ chartConfig.linkDistance }}px</span></label>
              <input type="range" min="100" max="600" step="10" v-model.number="chartConfig.linkDistance" class="config-slider" />
              <label class="config-label"><span>Repo link distance</span><span class="config-val">{{ chartConfig.productLinkDistance }}px</span></label>
              <input type="range" min="60" max="300" step="10" v-model.number="chartConfig.productLinkDistance" class="config-slider" />
            </div>
            <div class="config-group">
              <h4 class="config-group-title">Repulsion</h4>
              <label class="config-label"><span>Team nodes</span><span class="config-val">{{ chartConfig.chargeStrength }}</span></label>
              <input type="range" min="-3000" max="-100" step="50" v-model.number="chartConfig.chargeStrength" class="config-slider" />
              <label class="config-label"><span>Repo nodes</span><span class="config-val">{{ chartConfig.productChargeStrength }}</span></label>
              <input type="range" min="-1000" max="-50" step="25" v-model.number="chartConfig.productChargeStrength" class="config-slider" />
            </div>
            <div class="config-group">
              <h4 class="config-group-title">Arrows</h4>
              <label class="config-label"><span>Min width</span><span class="config-val">{{ chartConfig.arrowMinWidth }}px</span></label>
              <input type="range" min="0.5" max="5" step="0.5" v-model.number="chartConfig.arrowMinWidth" class="config-slider" />
              <label class="config-label"><span>Max width</span><span class="config-val">{{ chartConfig.arrowMaxWidth }}px</span></label>
              <input type="range" min="1" max="20" step="0.5" v-model.number="chartConfig.arrowMaxWidth" class="config-slider" />
              <label class="config-label"><span>Curvature</span><span class="config-val">{{ chartConfig.curvature }}</span></label>
              <input type="range" min="0.05" max="0.6" step="0.05" v-model.number="chartConfig.curvature" class="config-slider" />
            </div>
          </div>
          <button class="config-reset-btn" @click="resetConfig">Reset defaults</button>
        </div>
      </transition>

      <div class="svg-scroll-wrapper">
        <svg ref="svgRef" class="network-svg"></svg>
      </div>
    </template>

    <teleport to="body">
      <div v-if="tooltip.show" class="net-tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        <div class="net-tooltip-header">
          <template v-if="tooltip.type === 'link'">
            <span class="tt-team" :style="{ color: getTeamColor(tooltip.source) }">{{ tooltip.source }}</span>
            <span class="tt-arrow">→</span>
            <span class="tt-team" :style="{ color: getTeamColor(tooltip.target) }">{{ tooltip.target }}</span>
          </template>
          <template v-else-if="tooltip.type === 'product'">
            <span class="tt-product-name">{{ tooltip.productName }}</span>
            <span class="tt-team-badge" :style="{ background: getTeamColor(tooltip.owningTeam) }">{{ tooltip.owningTeam }}</span>
          </template>
          <template v-else>
            <span class="tt-team" :style="{ color: getTeamColor(tooltip.teamName) }">{{ tooltip.teamName }}</span>
            <span v-if="tooltip.expandable" class="tt-expand-hint">Click to drill down</span>
          </template>
        </div>
        <div class="net-tooltip-body">
          <template v-if="tooltip.type === 'link'">
            <div class="tt-row"><span class="tt-label">Contributors:</span><span class="tt-value">{{ tooltip.contributorCount }}</span></div>
            <div class="tt-row"><span class="tt-label">Commits:</span><span class="tt-value">{{ tooltip.contributions.toLocaleString() }}</span></div>
            <div v-if="tooltip.contributors?.length" class="tt-list">
              <div class="tt-list-label">Contributors:</div>
              <div v-for="c in tooltip.contributors" :key="c" class="tt-list-item">
                {{ c }}<span v-if="tooltip.contributorCommits?.[c]" class="tt-contributor-commits">({{ tooltip.contributorCommits[c] }})</span>
              </div>
            </div>
            <div v-if="tooltip.reverseContributions != null" class="tt-list">
              <div class="tt-list-label">← Reverse direction</div>
              <div class="tt-row"><span class="tt-label">Commits:</span><span class="tt-value">{{ tooltip.reverseContributions.toLocaleString() }}</span></div>
            </div>
          </template>
          <template v-else-if="tooltip.type === 'product'">
            <div v-for="link in tooltip.incomingLinks" :key="link.source" class="tt-product-source">
              <span class="tt-team" :style="{ color: getTeamColor(link.source) }">{{ link.source }}</span>
              <span class="tt-value">{{ link.contributorCount }} contributors · {{ link.contributions.toLocaleString() }} commits</span>
            </div>
            <div v-if="tooltip.allContributors?.length" class="tt-list">
              <div class="tt-list-label">Contributors:</div>
              <div v-for="c in tooltip.allContributors" :key="c" class="tt-list-item">{{ c }}</div>
            </div>
          </template>
          <template v-else>
            <div class="tt-row"><span class="tt-label">Own commits:</span><span class="tt-value">{{ (tooltip.ownContributions || 0).toLocaleString() }}</span></div>
            <div class="tt-row"><span class="tt-label">Cross-out to:</span><span class="tt-value">{{ tooltip.outLinks }} {{ tooltip.outLinks === 1 ? 'team' : 'teams' }}</span></div>
            <div class="tt-row"><span class="tt-label">Cross-in from:</span><span class="tt-value">{{ tooltip.inLinks }} {{ tooltip.inLinks === 1 ? 'team' : 'teams' }}</span></div>
          </template>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, reactive } from 'vue';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import { useLensStore } from '../stores/useLensStore';

const store = useLensStore();
const { filteredData, teams, authorMap, productTeamMap, teamColors } = storeToRefs(store);
const { displayAuthor } = store;

// When no teams are configured, auto-generate one team per repo and assign
// each author to the repo they contribute to most so the graph still renders.
const effectiveTeams = computed(() => {
  if (teams.value?.length) return teams.value;
  const authorBest = {};
  filteredData.value.forEach(row => {
    const cur = authorBest[row.Author];
    if (!cur || row.ContributionCount > cur.count)
      authorBest[row.Author] = { repo: row.Product, count: row.ContributionCount };
  });
  const teamMap = {};
  [...new Set(filteredData.value.map(r => r.Product))].forEach((repo, i) => {
    teamMap[repo] = { id: repo, name: repo, color: DEFAULT_COLORS[i % DEFAULT_COLORS.length], authors: [], products: [repo] };
  });
  Object.entries(authorBest).forEach(([author, { repo }]) => {
    if (teamMap[repo]) teamMap[repo].authors.push(author);
  });
  return Object.values(teamMap);
});

const effectiveProductTeamMap = computed(() => {
  if (teams.value?.length) return productTeamMap.value;
  const map = {};
  effectiveTeams.value.forEach(t => t.products.forEach(p => { map[p] = t.name; }));
  return map;
});

const svgRef = ref(null);
const containerRef = ref(null);
const tooltip = ref({ show: false, x: 0, y: 0, type: 'link' });
const dimensions = reactive({ width: 900, height: 620 });

const expandedTeam = ref(null);
const showConfig = ref(false);
const isFullscreen = ref(false);

function toggleFullscreen() { isFullscreen.value = !isFullscreen.value; }
function handleKeyDown(e) { if (e.key === 'Escape' && isFullscreen.value) isFullscreen.value = false; }

function formatBadgeValue(d) {
  const v = d.contributions;
  if (v >= 10000) return Math.round(v / 1000) + 'K';
  if (v >= 1000) return (v / 1000).toFixed(1).replace('.0', '') + 'K';
  return v;
}

const DEFAULT_CONFIG = {
  linkDistance: 530, productLinkDistance: 260,
  chargeStrength: -1100, productChargeStrength: -350,
  collisionPadding: 55, productCollisionPadding: 28,
  arrowMinWidth: 1, arrowMaxWidth: 5, curvature: 0.28,
};
const chartConfig = reactive({ ...DEFAULT_CONFIG });
function resetConfig() { Object.assign(chartConfig, DEFAULT_CONFIG); }

const storedPositions = {};

const DEFAULT_COLORS = ['#225EA9', '#088F9B', '#F08223', '#5A4A80', '#C45E0F', '#006B75', '#3A75BA', '#1A9FA9'];
function getTeamColor(teamName) {
  if (teamColors.value?.[teamName]) return teamColors.value[teamName];
  const idx = effectiveTeams.value.findIndex(t => t.name === teamName);
  return DEFAULT_COLORS[idx >= 0 ? idx % DEFAULT_COLORS.length : 0];
}
function getTeamAbbrev(name) {
  return name.split(/[\s\-_]+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 3);
}

const isAutoMode = computed(() => !teams.value?.length);

// In auto-mode: bipartite graph — author nodes connected to repo (product) nodes.
const autoModeData = computed(() => {

  const authorTotals = {};
  const repoTotals = {};
  filteredData.value.forEach(row => {
    authorTotals[row.Author] = (authorTotals[row.Author] || 0) + row.ContributionCount;
    repoTotals[row.Product] = (repoTotals[row.Product] || 0) + row.ContributionCount;
  });

  const authorNodes = Object.keys(authorTotals).map((a, i) => ({
    id: a,
    isAuthor: true,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    ownContributions: authorTotals[a],
  }));

  const repoNodes = Object.keys(repoTotals).map(r => ({
    id: r,
    isProduct: true,
    owningTeam: null,
    ownContributions: repoTotals[r],
  }));

  const links = filteredData.value.map(row => ({
    source: row.Author,
    target: row.Product,
    contributions: row.ContributionCount,
    contributorCount: 1,
    contributors: [row.Author],
    contributorCommits: { [row.Author]: row.ContributionCount },
    products: [row.Product],
    productBreakdown: {},
    isProductLink: true,
  }));

  return { nodes: [...authorNodes, ...repoNodes], links };
});

// author → Set<teamName>
const authorTeamMap = computed(() => {
  const map = {};
  effectiveTeams.value.forEach(team => {
    (team.authors || []).forEach(author => {
      const mapped = authorMap.value[author] || author;
      if (!map[mapped]) map[mapped] = new Set();
      map[mapped].add(team.name);
    });
  });
  return map;
});

const crossTeamData = computed(() => {
  const atm = authorTeamMap.value;
  const ownContrib = {};
  effectiveTeams.value.forEach(t => { ownContrib[t.name] = 0; });
  const linkMap = {};

  filteredData.value.forEach(row => {
    const authorTeams = atm[row.Author];
    const productTeam = effectiveProductTeamMap.value[row.Product];
    if (!authorTeams || !productTeam) return;

    const authorTeam = [...authorTeams][0];
    if (authorTeams.has(productTeam)) { ownContrib[productTeam] = (ownContrib[productTeam] || 0) + row.ContributionCount; return; }
    if (authorTeam === productTeam) return;

    const key = `${authorTeam}||${productTeam}`;
    if (!linkMap[key]) {
      linkMap[key] = { source: authorTeam, target: productTeam, contributions: 0, contributors: new Set(), contributorCommits: {}, products: new Set(), productBreakdown: {} };
    }
    linkMap[key].contributions += row.ContributionCount;
    linkMap[key].contributors.add(row.Author);
    linkMap[key].contributorCommits[row.Author] = (linkMap[key].contributorCommits[row.Author] || 0) + row.ContributionCount;
    linkMap[key].products.add(row.Product);
    const pb = linkMap[key].productBreakdown;
    if (!pb[row.Product]) pb[row.Product] = { contributions: 0, contributors: new Set() };
    pb[row.Product].contributions += row.ContributionCount;
    pb[row.Product].contributors.add(row.Author);
  });

  const links = Object.values(linkMap).map(l => ({
    source: l.source, target: l.target,
    contributions: l.contributions,
    contributorCount: l.contributors.size,
    contributors: Array.from(l.contributors).sort((a, b) => (l.contributorCommits[b] || 0) - (l.contributorCommits[a] || 0)),
    contributorCommits: l.contributorCommits,
    products: Array.from(l.products),
    productBreakdown: Object.fromEntries(Object.entries(l.productBreakdown).map(([p, v]) => [p, { contributions: v.contributions, contributorCount: v.contributors.size, contributors: Array.from(v.contributors) }])),
  }));

  const nodes = effectiveTeams.value.map(t => ({ id: t.name, ownContributions: ownContrib[t.name] || 0 }));
  return { nodes, links };
});

const activeData = computed(() => {
  if (isAutoMode.value) return autoModeData.value;
  const ct = crossTeamData.value;
  return ct.links.length ? ct : autoModeData.value;
});

const graphData = computed(() => {
  const { nodes, links } = activeData.value;
  if (isAutoMode.value || !expandedTeam.value) return { nodes, links };
  const et = expandedTeam.value;
  const incomingLinks = links.filter(l => l.target === et);
  if (!incomingLinks.length) return { nodes, links };

  const productSet = new Set();
  incomingLinks.forEach(l => Object.keys(l.productBreakdown).forEach(p => productSet.add(p)));

  const productNodes = Array.from(productSet).map(p => ({ id: p, isProduct: true, owningTeam: et, ownContributions: 0 }));
  const newNodes = [...nodes.filter(n => n.id !== et), ...productNodes];
  const newLinks = [];
  links.forEach(l => {
    if (l.target === et) {
      Object.entries(l.productBreakdown).forEach(([product, data]) => {
        newLinks.push({ source: l.source, target: product, contributions: data.contributions, contributorCount: data.contributorCount, contributors: data.contributors, products: [product], isProductLink: true });
      });
    } else if (l.source !== et) {
      newLinks.push(l);
    }
  });
  return { nodes: newNodes, links: newLinks };
});

const crossLinks = computed(() => activeData.value.links);
const hasLinks = computed(() => crossLinks.value.length > 0);
const expandableTeams = computed(() => new Set(crossTeamData.value.links.map(l => l.target)));

let currentSim = null;
let savedZoomTransform = null;

function drawGraph() {
  if (!svgRef.value) return;
  const { nodes, links } = graphData.value;
  if (!nodes.length || !links.length) return;

  if (currentSim) { currentSim.stop(); currentSim = null; }
  const svg = d3.select(svgRef.value);
  const existingRoot = svg.select('g');
  if (!existingRoot.empty()) { const t = existingRoot.attr('transform'); if (t) savedZoomTransform = d3.zoomTransform(existingRoot.node()); }
  svg.selectAll('*').remove();

  const W = dimensions.width, H = dimensions.height;
  svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

  let dragOccurred = false;
  svg.on('click', () => { if (!dragOccurred && expandedTeam.value) expandedTeam.value = null; });

  const root = svg.append('g');
  const zoomBehavior = d3.zoom().scaleExtent([0.25, 4]).on('zoom', e => {
    root.attr('transform', e.transform);
    const k = e.transform.k;
    svg.attr('width', Math.max(W, Math.round(W * k))).attr('height', Math.max(H, Math.round(H * k)));
  });
  svg.call(zoomBehavior);
  if (savedZoomTransform) svg.call(zoomBehavior.transform, savedZoomTransform);

  const defs = svg.append('defs');
  defs.append('marker').attr('id', 'arrow-cln').attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0).attr('markerWidth', 10).attr('markerHeight', 10).attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#94a3b8');

  const maxOwn = d3.max(nodes.filter(n => !n.isProduct), n => n.ownContributions) || 1;
  const maxRepoOwn = d3.max(nodes.filter(n => n.isProduct), n => n.ownContributions) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxOwn]).range([22, 54]);
  const repoScale = d3.scaleSqrt().domain([0, maxRepoOwn]).range([14, 36]);
  // nodeR returns the effective radius/half-size used for spacing and arrow offsets
  const nodeR = d => d.isProduct ? repoScale(d.ownContributions) : rScale(d.ownContributions);

  const maxContrib = d3.max(links, l => l.contributions) || 1;
  const wScale = d3.scaleSqrt().domain([0, maxContrib]).range([chartConfig.arrowMinWidth, chartConfig.arrowMaxWidth]);

  const allLinkKeys = new Set(links.map(l => `${l.source}||${l.target}`));
  const biDirSet = new Set(links.filter(l => allLinkKeys.has(`${l.target}||${l.source}`)).map(l => `${l.source}||${l.target}`));

  const et = expandedTeam.value;
  const simNodes = nodes.map((n, i) => {
    if (n.isProduct) {
      const base = storedPositions[n.owningTeam] || { x: W / 2, y: H / 2 };
      const angle = (2 * Math.PI * i) / nodes.filter(x => x.isProduct).length;
      return { ...n, x: base.x + Math.cos(angle) * 70, y: base.y + Math.sin(angle) * 70 };
    }
    const saved = storedPositions[n.id];
    return saved ? { ...n, x: saved.x, y: saved.y } : { ...n };
  });
  const simLinks = links.map(l => ({ ...l }));

  const sim = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id(d => d.id).distance(d => d.isProductLink ? chartConfig.productLinkDistance : chartConfig.linkDistance).strength(0.6))
    .force('charge', d3.forceManyBody().strength(n => n.isProduct ? chartConfig.productChargeStrength : chartConfig.chargeStrength))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(0.05))
    .force('collide', d3.forceCollide(d => nodeR(d) + (d.isProduct ? chartConfig.productCollisionPadding : chartConfig.collisionPadding)));

  if (et) {
    sim.force('cluster', alpha => {
      const base = storedPositions[et] || { x: W / 2, y: H / 2 };
      simNodes.forEach(n => {
        if (n.isProduct) { n.vx = (n.vx || 0) + (base.x - n.x) * alpha * 0.08; n.vy = (n.vy || 0) + (base.y - n.y) * alpha * 0.08; }
      });
    });
  }
  currentSim = sim;

  const linkEls = root.append('g').selectAll('path').data(simLinks).join('path')
    .attr('fill', 'none').attr('stroke', '#94a3b8')
    .attr('stroke-width', d => wScale(d.contributions))
    .attr('stroke-opacity', 0.6)
    .attr('stroke-dasharray', d => d.isProductLink ? '6 3' : null)
    .attr('marker-end', 'url(#arrow-cln)').style('cursor', 'pointer')
    .on('mouseenter', function(event, d) {
      d3.select(this).attr('stroke-opacity', 1).attr('stroke', '#225EA9');
      tooltip.value = { show: true, x: event.clientX + 14, y: event.clientY - 10, type: 'link', source: d.source.id || d.source, target: d.target.id || d.target, contributions: d.contributions, contributorCount: d.contributorCount, contributors: d.contributors, contributorCommits: d.contributorCommits, products: d.products, productCount: d.products.length };
    })
    .on('mousemove', event => { tooltip.value.x = event.clientX + 14; tooltip.value.y = event.clientY - 10; })
    .on('mouseleave', function() { d3.select(this).attr('stroke-opacity', 0.6).attr('stroke', '#94a3b8'); tooltip.value.show = false; });

  const linkLabels = root.append('g').selectAll('g').data(simLinks).join('g').style('cursor', 'pointer')
    .on('mouseenter', function(event, d) {
      linkEls.filter(l => l === d).attr('stroke-opacity', 1).attr('stroke', '#225EA9');
      tooltip.value = { show: true, x: event.clientX + 14, y: event.clientY - 10, type: 'link', source: d.source.id || d.source, target: d.target.id || d.target, contributions: d.contributions, contributorCount: d.contributorCount, contributors: d.contributors, contributorCommits: d.contributorCommits, products: d.products, productCount: d.products.length };
    })
    .on('mousemove', event => { tooltip.value.x = event.clientX + 14; tooltip.value.y = event.clientY - 10; })
    .on('mouseleave', function(event, d) { linkEls.filter(l => l === d).attr('stroke-opacity', 0.6).attr('stroke', '#94a3b8'); tooltip.value.show = false; });
  linkLabels.append('circle').attr('r', 13).attr('fill', 'white').attr('stroke', '#cbd5e1').attr('stroke-width', 1.5);
  linkLabels.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', '10px').attr('font-weight', '700').attr('fill', '#1f2937').attr('pointer-events', 'none').text(d => formatBadgeValue(d));

  const nodeEls = root.append('g').selectAll('g').data(simNodes).join('g')
    .style('cursor', d => d.isProduct ? 'default' : (!isAutoMode.value && expandableTeams.value.has(d.id)) ? 'zoom-in' : 'grab')
    .call(d3.drag()
      .on('start', (event, d) => { dragOccurred = false; if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { dragOccurred = true; d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      if (d.isProduct || isAutoMode.value) return;
      if (expandableTeams.value.has(d.id)) expandedTeam.value = expandedTeam.value === d.id ? null : d.id;
    })
    .on('mouseenter', (event, d) => {
      if (d.isProduct) {
        const incomingLinks = simLinks.filter(l => (l.target.id || l.target) === d.id).map(l => ({ source: l.source.id || l.source, contributions: l.contributions, contributorCount: l.contributorCount, contributors: l.contributors }));
        const allContribs = [...new Set(incomingLinks.flatMap(l => l.contributors))];
        tooltip.value = { show: true, x: event.clientX + 14, y: event.clientY - 10, type: 'product', productName: d.id, owningTeam: d.owningTeam, incomingLinks, allContributors: allContribs };
      } else {
        tooltip.value = { show: true, x: event.clientX + 14, y: event.clientY - 10, type: 'node', teamName: d.id, ownContributions: d.ownContributions, outLinks: simLinks.filter(l => (l.source.id || l.source) === d.id).length, inLinks: simLinks.filter(l => (l.target.id || l.target) === d.id).length, expandable: !isAutoMode.value && expandableTeams.value.has(d.id) };
      }
    })
    .on('mousemove', event => { tooltip.value.x = event.clientX + 14; tooltip.value.y = event.clientY - 10; })
    .on('mouseleave', () => { tooltip.value.show = false; });

  // Dashed ring on author nodes that have outgoing links
  nodeEls.filter(d => !d.isProduct && simLinks.some(l => (l.source.id || l.source) === d.id))
    .append('circle').attr('r', d => nodeR(d) + 6).attr('fill', 'none').attr('stroke', d => d.color || getTeamColor(d.id)).attr('stroke-width', 2).attr('stroke-opacity', 0.3).attr('stroke-dasharray', '4 3');

  // Author nodes — circles
  nodeEls.filter(d => !d.isProduct)
    .append('circle').attr('r', d => nodeR(d))
    .attr('fill', d => d.color || getTeamColor(d.id))
    .attr('stroke', '#fff').attr('stroke-width', 3).attr('opacity', 0.92);

  // Repo nodes — squares
  nodeEls.filter(d => d.isProduct)
    .append('rect')
    .attr('x', d => -nodeR(d)).attr('y', d => -nodeR(d))
    .attr('width', d => nodeR(d) * 2).attr('height', d => nodeR(d) * 2)
    .attr('rx', 4).attr('ry', 4)
    .attr('fill', d => d.color || getTeamColor(d.owningTeam))
    .attr('stroke', '#fff').attr('stroke-width', 2).attr('opacity', 0.88);

  // Expand hint on drillable team nodes (team mode only)
  nodeEls.filter(d => !d.isProduct && !isAutoMode.value && expandableTeams.value.has(d.id))
    .append('text').attr('text-anchor', 'middle').attr('dy', d => -nodeR(d) + 12).attr('dx', d => nodeR(d) - 10).attr('fill', 'white').attr('font-size', '13px').attr('font-weight', '900').attr('pointer-events', 'none').text('⊕');

  // Inner label
  nodeEls.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', 'white')
    .attr('font-size', d => Math.max(9, Math.min(14, nodeR(d) * 0.42)) + 'px')
    .attr('font-weight', '800').attr('pointer-events', 'none')
    .text(d => getTeamAbbrev(d.id));

  // Outer label below node
  nodeEls.append('text').attr('text-anchor', 'middle').attr('dy', d => nodeR(d) + 14)
    .attr('fill', '#1f2937').attr('font-size', '11px').attr('font-weight', '600').attr('pointer-events', 'none')
    .text(d => d.id);

  function calcPath(d) {
    const sx = d.source.x || 0, sy = d.source.y || 0, tx = d.target.x || 0, ty = d.target.y || 0;
    const dx = tx - sx, dy2 = ty - sy, len = Math.sqrt(dx * dx + dy2 * dy2);
    if (len < 1) return '';
    const ux = dx / len, uy = dy2 / len;
    const srcId = d.source.id || d.source, tgtId = d.target.id || d.target;
    const x1 = sx + ux * (nodeR(d.source) + 5), y1 = sy + uy * (nodeR(d.source) + 5);
    const x2 = tx - ux * (nodeR(d.target) + 14), y2 = ty - uy * (nodeR(d.target) + 14);
    if (biDirSet.has(`${srcId}||${tgtId}`)) {
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      return `M${x1},${y1} Q${mx - uy * len * chartConfig.curvature},${my + ux * len * chartConfig.curvature} ${x2},${y2}`;
    }
    return `M${x1},${y1} L${x2},${y2}`;
  }

  function calcLabelPos(d) {
    const sx = d.source.x || 0, sy = d.source.y || 0, tx = d.target.x || 0, ty = d.target.y || 0;
    const srcId = d.source.id || d.source, tgtId = d.target.id || d.target;
    if (biDirSet.has(`${srcId}||${tgtId}`)) {
      const dx = tx - sx, dy2 = ty - sy, len = Math.sqrt(dx * dx + dy2 * dy2) || 1;
      const ux = dx / len, uy = dy2 / len;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      const pcx = mx - uy * len * chartConfig.curvature, pcy = my + ux * len * chartConfig.curvature;
      return { x: 0.25 * sx + 0.5 * pcx + 0.25 * tx, y: 0.25 * sy + 0.5 * pcy + 0.25 * ty };
    }
    return { x: (sx + tx) / 2, y: (sy + ty) / 2 };
  }

  sim.on('tick', () => {
    simNodes.forEach(n => { if (!n.isProduct) storedPositions[n.id] = { x: n.x || 0, y: n.y || 0 }; });
    linkEls.attr('d', calcPath);
    linkLabels.attr('transform', d => { const p = calcLabelPos(d); return `translate(${p.x},${p.y})`; });
    nodeEls.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
  });
}

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

watch(graphData, () => { savedZoomTransform = null; drawGraph(); }, { deep: true });
watch(chartConfig, () => { drawGraph(); }, { deep: true });
watch(isFullscreen, () => { requestAnimationFrame(() => updateSize()); });

let updateSize;
onMounted(() => {
  updateSize = () => {
    if (!containerRef.value) return;
    if (isFullscreen.value) {
      dimensions.width = Math.max(500, window.innerWidth - 48);
      dimensions.height = Math.max(400, window.innerHeight - 160);
    } else {
      const w = containerRef.value.clientWidth - 48;
      dimensions.width = Math.max(500, Math.min(1400, w));
      dimensions.height = Math.max(400, Math.min(800, dimensions.width * 0.68));
    }
    drawGraph();
  };
  updateSize();
  const debouncedUpdate = debounce(updateSize, 150);
  window.addEventListener('resize', debouncedUpdate);
  window.addEventListener('keydown', handleKeyDown);

  onBeforeUnmount(() => {
    window.removeEventListener('resize', debouncedUpdate);
    window.removeEventListener('keydown', handleKeyDown);
    if (currentSim) currentSim.stop();
    if (svgRef.value) d3.select(svgRef.value).selectAll('*').remove();
  });
});
</script>

<style scoped>
.network-container {
  @apply relative bg-white rounded-xl shadow-lg border-2 border-gray-100
         transition-all duration-300 hover:shadow-xl hover:border-brand-blue/30 p-6;
  animation: slideUp 0.4s ease-out;
}
.network-container.fullscreen {
  position: fixed; inset: 0; z-index: 50; border-radius: 0; overflow-y: auto; margin: 0; animation: none;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.chart-header { @apply mb-5 text-center; }
.chart-title { @apply text-2xl font-bold text-brand-gray mb-2; }
.chart-description { @apply text-sm text-gray-500 leading-relaxed max-w-2xl mx-auto; }
.drilldown-banner { @apply flex items-center justify-between gap-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-brand-gray; }
.collapse-btn { @apply px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-brand-blue/30 text-brand-blue hover:bg-brand-blue hover:text-white transition-all duration-150 whitespace-nowrap; }
.banner-enter-active, .banner-leave-active { transition: all 0.2s ease; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-6px); }
.toolbar-row { @apply flex gap-2 mb-4 justify-end; }
.hint-row { @apply text-gray-400 text-xs italic mt-1 mb-1; }
.icon-btn { @apply flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-brand-blue hover:text-white hover:border-brand-blue transition-all duration-150 self-center; }
.icon-btn.active { @apply bg-brand-blue text-white border-brand-blue; }
.fs-icon { width: 16px; height: 16px; }
.config-panel { @apply mb-5 bg-gray-50 border border-gray-200 rounded-xl p-4; }
.config-grid { @apply grid gap-5; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.config-group { @apply flex flex-col gap-2; }
.config-group-title { @apply text-xs font-bold text-gray-500 uppercase tracking-wide mb-1; }
.config-label { @apply flex justify-between items-center text-xs text-gray-600 font-medium mt-1; }
.config-val { @apply font-mono text-brand-blue font-bold; }
.config-slider { @apply w-full h-1.5 rounded-full appearance-none cursor-pointer; accent-color: #225EA9; }
.config-reset-btn { @apply mt-4 px-4 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all duration-150; }
.config-panel-enter-active, .config-panel-leave-active { transition: all 0.2s ease; }
.config-panel-enter-from, .config-panel-leave-to { opacity: 0; transform: translateY(-8px); }
.svg-scroll-wrapper { overflow: auto; border-radius: 8px; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
.svg-scroll-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
.svg-scroll-wrapper::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.network-svg { display: block; }
.empty-state { @apply flex flex-col items-center justify-center gap-3 py-16 text-gray-400; }
.empty-icon { @apply text-5xl; }
.empty-state p { @apply text-base text-center max-w-md; }
.net-tooltip { @apply fixed pointer-events-none bg-white rounded-xl shadow-2xl border-2 px-4 py-3 text-sm; border-color: #225EA9; z-index: 9999; min-width: 220px; max-width: 340px; max-height: 70vh; overflow-y: auto; animation: tooltipFadeIn 0.15s ease-out; }
@keyframes tooltipFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.net-tooltip-header { @apply flex items-center gap-2 border-b border-gray-200 pb-2 mb-2 font-bold text-base flex-wrap; }
.tt-team { @apply font-bold; }
.tt-arrow { @apply text-gray-400 font-normal; }
.net-tooltip-body { @apply space-y-1.5; }
.tt-row { @apply flex items-center justify-between gap-3 text-gray-700; }
.tt-label { @apply text-xs font-medium text-gray-500 uppercase tracking-wide; }
.tt-value { @apply font-mono font-bold text-brand-gray; }
.tt-list { @apply mt-2 border-t border-gray-100 pt-2; }
.tt-list-label { @apply text-xs text-gray-400 uppercase tracking-wide mb-1; }
.tt-list-item { @apply text-xs text-gray-700 flex items-center justify-between gap-2; }
.tt-contributor-commits { @apply text-xs text-gray-400 font-mono shrink-0; }
.tt-list-more { @apply text-xs text-gray-400 italic mt-0.5; }
.tt-list-item--product { @apply font-mono text-brand-teal; }
.tt-product-name { @apply font-bold font-mono text-brand-gray; }
.tt-team-badge { @apply text-white text-xs font-semibold px-2 py-0.5 rounded-full ml-auto; }
.tt-expand-hint { @apply text-xs text-brand-blue font-normal ml-auto italic; }
.tt-product-source { @apply flex items-center justify-between gap-3 text-xs py-0.5; }
@media (max-width: 768px) { .network-container { @apply p-4; } .chart-title { @apply text-xl; } }
</style>
