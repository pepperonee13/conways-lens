<template>
  <div class="graph-wrap" ref="containerRef">
    <div class="graph-header">
      <h3 class="graph-title">Conway's Law Violation Graph</h3>
      <div class="graph-desc-row">
        <p class="graph-desc">
          <span class="legend"><span class="legend-square"></span>Bounded Context</span>
          <span class="legend"><span class="legend-team"></span>Team</span>
          <span class="legend"><span class="legend-hull"></span>Ownership Boundary</span>
          &nbsp;·&nbsp; Node size = total commits &nbsp;·&nbsp; Edge crossing a boundary = violation
        </p>
        <div class="viz-dropdown-wrap" ref="vizDropRef">
          <button :class="['cross-team-btn', { active: edgeWeight }]" @click="vizOpen = !vizOpen">
            <span class="btn-dot"></span>
            Visualization
            <span class="viz-chevron">{{ vizOpen ? '▴' : '▾' }}</span>
          </button>
          <div v-if="vizOpen" class="viz-panel">
            <div class="viz-row">
              <span class="viz-row-label">Edge weight</span>
              <button :class="['viz-toggle-btn', { active: edgeWeight }]" @click="edgeWeight = !edgeWeight">
                {{ edgeWeight ? 'On' : 'Off' }}
              </button>
            </div>
            <p class="viz-desc">Color = source team &nbsp;·&nbsp; Width = commit volume</p>
            <div class="viz-divider"></div>

            <template v-if="effectiveTeams.length > 0">
              <div class="viz-row">
                <span class="viz-row-label">Violation threshold</span>
                <span class="viz-val">{{ violationThreshold }}%</span>
              </div>
              <input type="range" class="viz-slider" min="1" max="50" step="1"
                     v-model.number="violationThreshold" />
              <p class="viz-desc">Min outside-team % to show a violation ring</p>
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

            <div class="viz-row">
              <span class="viz-row-label">Team gravity</span>
              <span class="viz-val">{{ simConfig.teamGravity.toFixed(2) }}</span>
            </div>
            <input type="range" class="viz-slider" min="0" max="0.4" step="0.01"
                   v-model.number="simConfig.teamGravity" />

            <button class="viz-reset-btn" @click="resetSimConfig">Reset</button>
          </div>
        </div>
      </div>

      <div v-if="expandedTeams.size > 0" class="expanded-teams-row">
        <span class="expanded-label">Expanded:</span>
        <button v-for="t in expandedTeamsList" :key="t.id"
                class="expanded-team-chip"
                :style="{ background: t.color, borderColor: t.color }"
                @click="store.toggleTeamExpansion(t.id)">
          {{ t.name }}&nbsp;×
        </button>
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

    <div v-if="!store.dataLoaded" class="empty-state">Upload contribution data to get started.</div>
    <div v-else-if="effectiveTeams.length === 0" class="empty-state">
      Configure teams in the editor to visualize Conway's Law violations.
    </div>

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
import { useLensStore } from '../stores/useLensStore';
import { useConwayGraph } from '../composables/graphs/useConwayGraph.js';

const store = useLensStore();
const {
  ownershipGraphData, nodeColors,
  dateBounds, activeRange, expandedTeams, syntheticTeam,
} = storeToRefs(store);

const effectiveTeams = computed(() =>
  syntheticTeam.value ? [...store.teams, syntheticTeam.value] : store.teams
);
const expandedTeamsList = computed(() =>
  effectiveTeams.value.filter(t => expandedTeams.value.has(t.id))
);

const svgRef       = ref(null);
const containerRef = ref(null);
const vizDropRef   = ref(null);
const dims         = reactive({ w: 900, h: 600 });

const vizOpen            = ref(false);
const edgeWeight         = ref(true);
const violationThreshold = ref(10);

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
  teamGravity:      0.08,
};
const simConfig = reactive({ ...SIM_DEFAULTS });
function resetSimConfig() { Object.assign(simConfig, SIM_DEFAULTS); }

const tooltip = reactive({
  show: false, x: 0, y: 0,
  isLink: false,
  name: '', type: '', commits: 0,
  teamName: '', repoCount: 0, authorCount: 0,
  source: '', target: '', action: '',
});

const tooltipName = computed(() => {
  if (tooltip.type === 'team') return tooltip.teamName;
  return tooltip.name;
});

const tooltipDetail = computed(() => {
  const c = tooltip.commits.toLocaleString();
  if (tooltip.type === 'team')
    return `Team · ${tooltip.repoCount} ${tooltip.repoCount === 1 ? 'repo' : 'repos'} · ${tooltip.authorCount} ${tooltip.authorCount === 1 ? 'dev' : 'devs'} · ${c} commits`;
  return `Bounded Context · ${c} commits`;
});

function displayNodeName(id) {
  if (!id) return '';
  if (id.startsWith('team:')) {
    const teamId = id.slice(5);
    return effectiveTeams.value.find(t => t.id === teamId)?.name ?? id;
  }
  return id;
}

// ── Saved positions (persist across redraws) ──────────────────────────────
const savedPositions = {};

// ── Renderer ──────────────────────────────────────────────────────────────
const renderer = useConwayGraph({
  svgRef,
  effectiveTeams,
  expandedTeams,
  getNodeColor:        store.getNodeColor,
  toggleTeamExpansion: store.toggleTeamExpansion,
  savedPositions,
  onShowNodeTooltip: (d, x, y) => {
    const action = d.type === 'team'
      ? (expandedTeams.value.has(d.teamId) ? 'Click to collapse' : 'Click to expand')
      : '';
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      name: d.id, type: d.type, commits: d.commits,
      teamName: d.name ?? '', repoCount: d.repoCount ?? 0, authorCount: d.authorCount ?? 0,
      action,
    });
  },
  onShowLinkTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: true,
      source: d.source.id, target: d.target.id, commits: d.commits,
    });
  },
  onMoveTooltip: (x, y) => { tooltip.x = x; tooltip.y = y; },
  onHideTooltip: () => { tooltip.show = false; },
  config:              simConfig,
  edgeWeight,
  violationThreshold,
});

function redraw() {
  renderer.draw({ dims, data: ownershipGraphData.value });
}

watch(ownershipGraphData, () => redraw(), { deep: true });
watch(dims,               () => redraw());
watch(simConfig,          () => redraw(), { deep: true });
watch(edgeWeight,         () => renderer.updateEdgeStyles());
watch(nodeColors,         () => renderer.updateNodeColors());
watch(violationThreshold, () => renderer.drawOverlays());

// ── Resize ────────────────────────────────────────────────────────────────

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function updateSize() {
  if (!containerRef.value) return;
  const r = containerRef.value.getBoundingClientRect();
  dims.w = Math.max(500, r.width - 48);
  dims.h = Math.max(400, Math.min(800, dims.w * 0.65));
}

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
    renderer.teardown();
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
.cross-team-btn:hover  { border-color: #225EA9; color: #225EA9; }
.cross-team-btn.active { background: #225EA9; border-color: #225EA9; color: #fff; }
.btn-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: currentColor; flex-shrink: 0;
}
.legend        { @apply flex items-center gap-1.5 font-medium; }
.legend-square { display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: #088F9B; }
.legend-team   { display: inline-block; width: 22px; height: 12px; border-radius: 6px; background: #F08223; }
.legend-hull   {
  display: inline-block; width: 20px; height: 12px; border-radius: 4px;
  background: transparent; border: 2px dashed #F08223; opacity: 0.8;
}
.expanded-teams-row {
  @apply flex items-center gap-2 mt-3 flex-wrap justify-center;
}
.expanded-label {
  @apply text-xs font-semibold text-gray-400 uppercase tracking-wide;
}
.expanded-team-chip {
  display: inline-flex; align-items: center;
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
  color: #fff; border: 1.5px solid; cursor: pointer;
  opacity: 0.92; transition: opacity 0.12s, transform 0.12s;
}
.expanded-team-chip:hover { opacity: 1; transform: scale(1.04); }

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
  --tw-ring-color: #225EA9;
}
.date-sep          { @apply text-gray-400 text-sm font-medium; }
.date-reset-btn    {
  @apply text-xs px-2.5 py-1 rounded-lg border border-brand-orange text-brand-orange
         hover:bg-brand-orange hover:text-white transition-all duration-150 cursor-pointer;
  background: transparent;
}
.date-bounds-hint  { @apply text-xs text-gray-300 font-mono ml-1; }
.hint              { @apply text-xs text-gray-400 italic text-center mb-2; }
.svg-wrap          { overflow: auto; border-radius: 8px; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
.graph-svg         { display: block; }
.empty-state       { @apply flex items-center justify-center py-16 text-gray-400 text-base; }
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
.viz-dropdown-wrap  { position: relative; }
.viz-chevron        { font-size: 9px; margin-left: 3px; }
.viz-panel {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 200;
  background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10); padding: 10px 14px 8px; min-width: 240px;
  animation: fadeIn 0.12s ease-out;
}
.viz-row        { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.viz-row-label  { font-size: 13px; font-weight: 600; color: #374151; }
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
