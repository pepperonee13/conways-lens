<template>
  <div :class="['graph-wrap', { 'graph-wrap--fullscreen': isFullscreen }]" ref="containerRef">
    <div class="graph-header">
      <h3 v-if="!isFullscreen" class="graph-title">Team ownership lens</h3>
      <div class="graph-desc-row">
        <p v-if="!isFullscreen && !detailRepoId" class="graph-desc">
          <span class="legend"><span class="legend-team"></span>Team lane</span>
          <span class="legend"><span class="legend-repo"></span>Bounded Context</span>
          <span class="legend"><span class="legend-ring"></span>Violation ring</span>
          &nbsp;·&nbsp;
          <span class="info-wrap">
            Lanes sorted by violation severity
            <span class="info-icon" tabindex="0" aria-label="What is severity?">i</span>
            <span class="info-tooltip" role="tooltip">
              <strong>Severity</strong> = total cross-team commits touching a team, in both directions:
              <span class="info-line"><em>Inbound</em> — commits made by other teams into repos this team owns.</span>
              <span class="info-line"><em>Outbound</em> — commits made by this team into repos other teams own.</span>
              Lanes are ordered by inbound + outbound, descending. The threshold setting does not affect ordering.
            </span>
          </span>
          &nbsp;·&nbsp; Edge crossing a lane = cross-team contribution
        </p>
        <p v-if="!isFullscreen && detailRepoId && folderPath === null" class="graph-desc">
          <span class="legend"><span class="legend-detail-repo"></span>Bounded Context</span>
          <span class="legend"><span class="legend-detail-team"></span>Team (click to expand)</span>
          <span class="legend"><span class="legend-detail-author"></span>Author</span>
          &nbsp;·&nbsp; Edge width = commit volume &nbsp;·&nbsp; Click repo to explore folders
        </p>
        <p v-if="!isFullscreen && detailRepoId && folderPath !== null" class="graph-desc">
          <span class="legend"><span class="legend-detail-team"></span>Team (click to expand)</span>
          <span class="legend"><span class="legend-detail-author"></span>Author</span>
          <span class="legend"><span class="legend-folder"></span>Folder (› = drill in)</span>
          &nbsp;·&nbsp; Edge color = team &nbsp;·&nbsp; Hover node to see connections
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
              <p class="viz-desc">Min outside-team % to show a violation ring or edge</p>
              <div class="viz-divider"></div>

              <div class="viz-row">
                <span class="viz-row-label">Violating repos only</span>
                <button :class="['viz-toggle-btn', { active: violatingOnly }]" @click="violatingOnly = !violatingOnly">
                  {{ violatingOnly ? 'On' : 'Off' }}
                </button>
              </div>
              <p class="viz-desc">Hide repos with no contribution above the threshold</p>
              <div class="viz-divider"></div>
            </template>

            <div class="viz-row">
              <span class="viz-row-label">Display authors</span>
              <button :class="['viz-toggle-btn', { active: displayAuthors }]" @click="displayAuthors = !displayAuthors">
                {{ displayAuthors ? 'On' : 'Off' }}
              </button>
            </div>
            <p class="viz-desc">Show contributing author list in repo tooltips</p>
            <div class="viz-divider"></div>

            <div class="viz-row">
              <button class="viz-reset-btn" @click="resetVizDefaults">Reset to defaults</button>
            </div>
          </div>
        </div>
        <button class="maximize-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'">
          <Minimize2 v-if="isFullscreen" :size="14" />
          <Maximize2 v-else :size="14" />
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
      <div v-if="!detailRepoId && violationSummary.violating > 0" class="violation-banner">
        <strong>{{ violationSummary.violating }}</strong> out of
        <strong>{{ violationSummary.total }}</strong>
        {{ violationSummary.total === 1 ? 'repository violates' : 'repositories violate' }}
        the <strong>{{ violationThreshold }}%</strong> threshold
      </div>
      <template v-if="detailRepoId">
        <!-- Folder drill-down mode -->
        <template v-if="folderPath !== null">
          <div class="detail-header">
            <button class="back-btn" @click="closeDetail">← Back to overview</button>
            <nav class="folder-breadcrumb" aria-label="Folder path">
              <button class="breadcrumb-item breadcrumb-repo" @click="closeFolderMode">{{ detailRepoId }}</button>
              <template v-for="(seg, idx) in folderPath" :key="idx">
                <span class="breadcrumb-sep">/</span>
                <button
                  class="breadcrumb-item"
                  :class="{ 'breadcrumb-current': idx === folderPath.length - 1 }"
                  @click="breadcrumbNavigate(idx)"
                >{{ seg }}</button>
              </template>
            </nav>
          </div>
          <p v-if="!isFullscreen" class="hint">Scroll to zoom · Hover to inspect · Click › folder to drill in · Click breadcrumb to navigate up</p>
        </template>
        <!-- Author radial mode -->
        <template v-else>
          <div class="detail-header">
            <button class="back-btn" @click="closeDetail">← Back to overview</button>
            <span class="detail-title">Contributors to <strong>{{ detailRepoId }}</strong></span>
          </div>
          <p v-if="!isFullscreen" class="hint">Scroll to zoom · Hover nodes or edges to inspect · Click the repo to explore folders</p>
        </template>
        <div class="svg-wrap">
          <svg ref="detailSvgRef" class="graph-svg"></svg>
        </div>
      </template>
      <template v-else>
        <p v-if="!isFullscreen" class="hint">Scroll to zoom · Hover nodes or edges to inspect · Click a repo for author details</p>
        <div class="svg-wrap">
          <svg ref="svgRef" class="graph-svg"></svg>
        </div>
      </template>
    </template>

    <teleport to="body">
      <div v-if="tooltip.show" class="graph-tooltip"
           :class="{ 'graph-tooltip--anchor-right': tooltip.anchorRight }"
           :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        <template v-if="tooltip.isLink">
          <div class="tt-name">{{ displayNodeName(tooltip.source) }} → {{ displayNodeName(tooltip.target) }}</div>
          <div class="tt-detail">{{ tooltip.pct != null ? tooltip.pct + '%' : tooltip.commits.toLocaleString() + ' commits' }}</div>
        </template>
        <template v-else>
          <div class="tt-name">{{ tooltipName }}</div>
          <div v-if="tooltip.type === 'folder' && tooltip.folderFullPath" class="tt-path">{{ tooltip.folderFullPath }}</div>
          <div class="tt-detail">{{ tooltipDetail }}</div>
          <ul v-if="tooltip.type === 'repo' && tooltipContributions.length" class="tt-contribs">
            <li v-for="c in tooltipContributions" :key="c.teamId"
                :class="{ 'tt-contrib-owner': c.teamId === tooltip.owningTeamId }">
              <span class="tt-contrib-dot" :style="{ background: c.teamColor }"></span>
              <span class="tt-contrib-name">{{ c.teamName }}</span>
              <span class="tt-contrib-pct">{{ c.pct }}%</span>
            </li>
          </ul>
          <ul v-if="tooltip.authorContributions?.length" class="tt-contribs tt-contribs--authors">
            <li v-for="a in tooltip.authorContributions" :key="a.authorId">
              <span class="tt-contrib-dot" :style="{ background: a.teamColor || '#9CA3AF' }"></span>
              <span class="tt-contrib-name">{{ anonMap[a.authorId] ?? a.authorId }}</span>
              <span class="tt-contrib-pct">{{ a.pct }}%</span>
            </li>
          </ul>
          <div v-if="tooltip.action" class="tt-action">{{ tooltip.action }}</div>
        </template>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { Maximize2, Minimize2 } from 'lucide-vue-next';
import { useLensStore } from '../stores/useLensStore';
import { useSwimlaneGraph } from '../composables/graphs/useSwimlaneGraph.js';
import { useRepoDetailGraph } from '../composables/graphs/useRepoDetailGraph.js';
import { useRepoFolderGraph } from '../composables/graphs/useRepoFolderGraph.js';
import { useAnonymize } from '../composables/useAnonymize.js';
import { DEFAULT_VIOLATION_THRESHOLD, DEFAULT_DISPLAY_AUTHORS } from '../config.js';

const store = useLensStore();
const {
  ownershipGraphData, nodeColors,
  dateBounds, activeRange, syntheticTeam,
} = storeToRefs(store);

const effectiveTeams = computed(() =>
  syntheticTeam.value ? [...store.teams, syntheticTeam.value] : store.teams
);

const svgRef        = ref(null);
const detailSvgRef  = ref(null);
const containerRef  = ref(null);
const vizDropRef    = ref(null);
const dims          = reactive({ w: 900, h: 600 });
const detailRepoId  = ref(null);
const folderPath    = ref(null); // null = author view, [] = folder root, ['src'] = inside src/, etc.

const VIZ_DEFAULTS = {
  edgeWeight: true,
  violationThreshold: DEFAULT_VIOLATION_THRESHOLD,
  violatingOnly: true,
  displayAuthors: DEFAULT_DISPLAY_AUTHORS,
};

const vizOpen            = ref(false);
const isFullscreen       = ref(false);
const edgeWeight         = ref(VIZ_DEFAULTS.edgeWeight);
const violationThreshold = ref(VIZ_DEFAULTS.violationThreshold);
const violatingOnly      = ref(VIZ_DEFAULTS.violatingOnly);
const displayAuthors     = ref(VIZ_DEFAULTS.displayAuthors);

const violationSummary = computed(() => {
  const threshold = violationThreshold.value;
  const repos = ownershipGraphData.value.nodes.filter(n => n.type === 'repo');
  const violating = repos.filter(r =>
    r.commits && r.contributions?.some(c =>
      c.teamId !== r.owningTeamId && (c.commits / r.commits) * 100 >= threshold
    )
  ).length;
  return { violating, total: repos.length };
});

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  nextTick(() => updateSize());
}

function resetVizDefaults() {
  edgeWeight.value         = VIZ_DEFAULTS.edgeWeight;
  violationThreshold.value = VIZ_DEFAULTS.violationThreshold;
  violatingOnly.value      = VIZ_DEFAULTS.violatingOnly;
  displayAuthors.value     = VIZ_DEFAULTS.displayAuthors;
}

const tooltip = reactive({
  show: false, x: 0, y: 0, anchorRight: false,
  isLink: false,
  name: '', type: '', commits: 0, pct: null,
  teamName: '', repoCount: 0, authorCount: 0,
  source: '', target: '', action: '',
  contributions: [], owningTeamId: null,
  authorContributions: null,
  folderFullPath: null,
});

const tooltipName = computed(() => {
  if (tooltip.type === 'team' || tooltip.type === 'team-collapsed') return tooltip.teamName;
  if (tooltip.type === 'author') return anonMap.value[tooltip.name] ?? tooltip.name;
  return tooltip.name;
});

const tooltipDetail = computed(() => {
  const c = tooltip.commits.toLocaleString();
  if (tooltip.type === 'team')
    return `Team · ${tooltip.repoCount} ${tooltip.repoCount === 1 ? 'repo' : 'repos'} · ${tooltip.authorCount} ${tooltip.authorCount === 1 ? 'dev' : 'devs'} · ${c} commits`;
  if (tooltip.type === 'team-collapsed') {
    const devs = tooltip.authorCount;
    return `${devs} ${devs === 1 ? 'dev' : 'devs'} · ${c} commits · click to expand`;
  }
  if (tooltip.type === 'folder') {
    const pctStr = tooltip.pct != null ? `${tooltip.pct}% of commits` : `${c} commits`;
    return pctStr;
  }
  const team = tooltip.teamName ? ` · ${tooltip.teamName}` : '';
  const pctStr = tooltip.pct != null ? `${tooltip.pct}%` : `${c} commits`;
  return `${pctStr}${team}`;
});

const tooltipContributions = computed(() => {
  if (tooltip.type !== 'repo') return [];
  const total = tooltip.commits || 0;
  if (!total) return [];
  const threshold = violationThreshold.value;
  return tooltip.contributions
    .filter(c =>
      c.teamId === tooltip.owningTeamId || (c.commits / total) * 100 >= threshold
    )
    .map(c => ({
      teamId: c.teamId,
      teamColor: c.teamColor,
      teamName: effectiveTeams.value.find(t => t.id === c.teamId)?.name ?? c.teamId,
      commits: c.commits,
      pct: ((c.commits / total) * 100).toFixed(1).replace(/\.0$/, ''),
    })).sort((a, b) => {
      const aOwner = a.teamId === tooltip.owningTeamId ? 1 : 0;
      const bOwner = b.teamId === tooltip.owningTeamId ? 1 : 0;
      if (aOwner !== bOwner) return bOwner - aOwner;
      return b.commits - a.commits;
    });
});

function displayNodeName(id) {
  if (!id) return '';
  if (id.startsWith('team:')) {
    const teamId = id.slice(5);
    return effectiveTeams.value.find(t => t.id === teamId)?.name ?? id;
  }
  return id;
}

const { anonymize } = useAnonymize();

const anonMap = computed(() => {
  const map = {};
  for (const node of ownershipGraphData.value.nodes) {
    if (node.type === 'author') map[node.id] = anonymize(node.id);
    if (node.authorContributions) {
      for (const a of node.authorContributions)
        if (!(a.authorId in map)) map[a.authorId] = anonymize(a.authorId);
    }
  }
  return map;
});

// ── Renderer ──────────────────────────────────────────────────────────────
const renderer = useSwimlaneGraph({
  svgRef,
  effectiveTeams,
  getNodeColor: store.getNodeColor,
  onShowNodeTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      anchorRight: d.type === 'team',
      name: d.id, type: d.type, commits: d.commits,
      teamName: d.name ?? '', repoCount: d.repoCount ?? 0, authorCount: d.authorCount ?? 0,
      action: d.type === 'repo' ? 'Click to see author contributions' : '',
      contributions: d.contributions ?? [],
      owningTeamId: d.owningTeamId ?? null,
      authorContributions: displayAuthors.value && (d.type === 'repo' || d.type === 'team') ? d.authorContributions ?? null : null,
    });
  },
  onShowLinkTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: true, anchorRight: false,
      source: d.source.id, target: d.target.id, commits: d.commits,
    });
  },
  onMoveTooltip: (x, y) => { tooltip.x = x; tooltip.y = y; },
  onHideTooltip: () => { tooltip.show = false; tooltip.anchorRight = false; },
  onNodeClick: (d) => openDetail(d.id),
  edgeWeight,
  violationThreshold,
  violatingOnly,
});

// ── Detail (repo contributor radial) renderer ────────────────────────────
const detailRenderer = useRepoDetailGraph({
  svgRef: detailSvgRef,
  effectiveTeams,
  getNodeColor: store.getNodeColor,
  anonMap,
  violationThreshold,
  onRepoClick: () => openFolderMode(),
  onShowNodeTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      name: d.id, type: d.type, commits: d.commits, pct: d.pct ?? null,
      teamName: d.teamName ?? '', repoCount: 0, authorCount: d.authors?.length ?? 0,
      action: d.action ?? '', contributions: d.contributions ?? [], owningTeamId: d.owningTeamId ?? null,
      authorContributions: d.authorContributions ?? null,
    });
  },
  onShowLinkTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: true,
      source: anonMap.value[d.authorId] ?? d.authorId, target: typeof d.target === 'object' ? d.target.id : d.target,
      commits: d.commits, pct: d.pct ?? null,
    });
  },
  onMoveTooltip: (x, y) => { tooltip.x = x; tooltip.y = y; },
  onHideTooltip: () => { tooltip.show = false; },
  edgeWeight,
});

// ── Folder drill-down renderer ────────────────────────────────────────────
const folderRenderer = useRepoFolderGraph({
  svgRef: detailSvgRef,
  effectiveTeams,
  getNodeColor: store.getNodeColor,
  anonMap,
  violationThreshold,
  onFolderClick: (segmentId) => drillDown(segmentId),
  onShowNodeTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      name: d.id, type: d.type, commits: d.commits, pct: d.pct ?? null,
      teamName: d.teamName ?? '', repoCount: 0, authorCount: d.authors?.length ?? 0,
      action: d.action ?? '', contributions: [], owningTeamId: null,
      authorContributions: d.authorContributions ?? null,
      folderFullPath: d.folderFullPath ?? null,
    });
  },
  onShowLinkTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: true,
      source: d.displaySource ?? d.sourceId,
      target: d.targetId,
      commits: d.commits, pct: d.pct ?? null,
    });
  },
  onMoveTooltip: (x, y) => { tooltip.x = x; tooltip.y = y; },
  onHideTooltip: () => { tooltip.show = false; },
  edgeWeight,
});

function openDetail(repoId) {
  folderRenderer.teardown();
  folderPath.value = null;
  detailRepoId.value = repoId;
  nextTick(() => {
    const data = store.repoContributorsData(repoId);
    detailRenderer.draw({ dims, data });
  });
}

function closeDetail() {
  detailRenderer.teardown();
  folderRenderer.teardown();
  folderPath.value = null;
  detailRepoId.value = null;
  nextTick(() => redraw());
}

function openFolderMode() {
  detailRenderer.teardown();
  folderPath.value = [];
  nextTick(() => redrawFolder());
}

function closeFolderMode() {
  folderRenderer.teardown();
  folderPath.value = null;
  nextTick(() => {
    const data = store.repoContributorsData(detailRepoId.value);
    detailRenderer.draw({ dims, data });
  });
}

function drillDown(segmentId) {
  folderPath.value = [...folderPath.value, segmentId];
  redrawFolder();
}

function breadcrumbNavigate(index) {
  folderPath.value = folderPath.value.slice(0, index + 1);
  redrawFolder();
}

function redrawFolder() {
  const prefix = (folderPath.value ?? []).join('/');
  const data = store.repoFolderData(detailRepoId.value, prefix);
  folderRenderer.draw({ dims, data });
}

function redraw() {
  renderer.draw({ dims, data: ownershipGraphData.value });
}

watch(ownershipGraphData, () => redraw(), { deep: true, flush: 'post' });
watch(dims,               () => redraw(), { flush: 'post' });
watch(edgeWeight, () => {
  if (detailRepoId.value) {
    (folderPath.value !== null ? folderRenderer : detailRenderer).updateEdgeStyles();
  } else {
    renderer.updateEdgeStyles();
  }
});
watch(nodeColors,         () => renderer.updateNodeColors());
watch(violationThreshold, () => {
  if (detailRepoId.value) {
    if (folderPath.value !== null) redrawFolder();
    else openDetail(detailRepoId.value);
  } else if (violatingOnly.value) redraw();
  else renderer.drawOverlays();
});
watch(violatingOnly,      () => redraw());

// ── Resize ────────────────────────────────────────────────────────────────

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function updateSize() {
  if (isFullscreen.value) {
    dims.w = window.innerWidth - 48;
    dims.h = window.innerHeight - 120;
    return;
  }
  if (!containerRef.value) return;
  const r = containerRef.value.getBoundingClientRect();
  dims.w = Math.max(500, r.width - 48);
  dims.h = Math.max(400, Math.min(800, dims.w * 0.65));
}

function handleDocClick(e) {
  if (vizOpen.value && vizDropRef.value && !vizDropRef.value.contains(e.target))
    vizOpen.value = false;
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false;
    nextTick(() => updateSize());
  }
}

onMounted(() => {
  updateSize();
  const onResize = debounce(updateSize, 150);
  window.addEventListener('resize', onResize);
  document.addEventListener('mousedown', handleDocClick);
  document.addEventListener('keydown', handleKeyDown);
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('mousedown', handleDocClick);
    document.removeEventListener('keydown', handleKeyDown);
    renderer.teardown();
    detailRenderer.teardown();
  });
});
</script>

<style scoped>
.graph-wrap {
  @apply relative bg-white rounded-xl shadow-lg border-2 border-gray-100 p-6
         transition-all duration-300 hover:shadow-xl hover:border-brand-blue/30;
  animation: slideUp 0.4s ease-out;
}
.graph-wrap--fullscreen {
  position: fixed !important;
  inset: 0;
  z-index: 1000;
  border-radius: 0 !important;
  border: none !important;
  box-shadow: none !important;
  padding: 16px 24px !important;
  overflow: auto;
  animation: none;
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
.legend-repo   { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #088F9B; opacity: 0.65; border: 1.5px solid #2F3944; }
.legend-team   { display: inline-block; width: 22px; height: 12px; border-radius: 6px; background: #F08223; }
.legend-ring   {
  display: inline-block; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; border: 3px solid #F08223; opacity: 0.85;
}
.legend-detail-repo   { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: #088F9B; opacity: 0.65; border: 1.5px solid #2F3944; }
.legend-detail-team   { display: inline-block; width: 26px; height: 14px; border-radius: 5px; background: #F08223; opacity: 0.85; }
.legend-detail-author { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #225EA9; }
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
.violation-banner {
  @apply text-sm text-center mb-2 px-4 py-2 rounded-lg;
  background: rgba(240, 130, 35, 0.10);
  border: 1px solid rgba(240, 130, 35, 0.35);
  color: #B85A14;
}
.violation-banner strong { color: #F08223; font-weight: 700; }

.info-wrap { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.info-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%;
  background: #225EA9; color: #fff;
  font-size: 9px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
  font-style: normal; line-height: 1;
  cursor: help; user-select: none;
}
.info-icon:focus { outline: 2px solid #088F9B; outline-offset: 1px; }
.info-tooltip {
  position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  width: 280px; padding: 10px 12px;
  background: #fff; color: #374151;
  border: 1.5px solid #225EA9; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  font-size: 11px; line-height: 1.5; font-style: normal; text-align: left;
  opacity: 0; pointer-events: none;
  transition: opacity 0.12s;
  z-index: 300;
}
.info-tooltip strong { color: #225EA9; }
.info-tooltip em { color: #088F9B; font-style: normal; font-weight: 600; }
.info-line { display: block; margin-top: 4px; }
.info-icon:hover + .info-tooltip,
.info-icon:focus + .info-tooltip { opacity: 1; }
.detail-header     { @apply flex items-center gap-3 mb-3 flex-wrap; }
.back-btn {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border
         border-gray-200 text-gray-500 bg-white hover:border-brand-blue hover:text-brand-blue
         transition-all duration-150 cursor-pointer flex-shrink-0;
}
.detail-title      { @apply text-sm text-gray-500; }

.folder-breadcrumb {
  @apply flex items-center gap-0 text-sm font-semibold flex-wrap;
}
.breadcrumb-item {
  @apply px-2 py-1 rounded text-xs font-semibold text-gray-500 bg-transparent border-none cursor-pointer
         hover:text-brand-blue hover:bg-blue-50 transition-all duration-100;
}
.breadcrumb-repo {
  @apply text-brand-teal hover:text-brand-teal hover:bg-teal-50;
  color: var(--brand-teal);
}
.breadcrumb-current {
  @apply text-brand-blue bg-blue-50;
  pointer-events: none;
}
.breadcrumb-sep {
  @apply text-gray-300 text-xs select-none px-0.5;
}

.legend-folder {
  display: inline-block; width: 30px; height: 14px; border-radius: 4px;
  background: #088F9B; opacity: 0.6; border: 1.5px solid #2F3944;
}
.svg-wrap          { overflow: auto; border-radius: 8px; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
.graph-svg         { display: block; }
.empty-state       { @apply flex items-center justify-center py-16 text-gray-400 text-base; }
.graph-tooltip {
  @apply fixed pointer-events-none bg-white rounded-xl shadow-2xl border-2 px-4 py-2.5 text-sm;
  border-color: #225EA9; z-index: 9999; min-width: 160px;
  animation: fadeIn 0.12s ease-out forwards;
}
.graph-tooltip--anchor-right {
  animation: fadeInRight 0.12s ease-out forwards;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeInRight {
  from { opacity: 0; transform: translateX(-100%) translateY(-4px); }
  to   { opacity: 1; transform: translateX(-100%) translateY(0); }
}
.tt-name   { @apply font-bold text-brand-gray text-base; }
.tt-path   { @apply text-gray-400 text-xs font-mono mt-0.5; }
.tt-detail { @apply text-gray-500 text-xs mt-0.5; }
.tt-action { @apply text-brand-blue text-xs mt-1 font-medium; }
.tt-contribs {
  margin: 6px 0 0; padding: 0; list-style: none;
  border-top: 1px solid #e2e8f0; padding-top: 6px;
}
.tt-contribs li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  align-items: center; gap: 8px;
  font-size: 11px; line-height: 1.6;
  color: #374151;
}
.tt-contrib-dot  { width: 10px; height: 10px; border-radius: 2px; }
.tt-contrib-name { font-weight: 600; white-space: nowrap; }
.tt-contrib-pct  { font-family: 'JetBrains Mono', monospace; color: #225EA9; font-weight: 700; }
.tt-contrib-count{ font-family: 'JetBrains Mono', monospace; color: #94a3b8; font-size: 10px; }
.tt-contrib-owner .tt-contrib-name { color: #088F9B; }
.tt-contribs--authors li { grid-template-columns: 10px 1fr auto; }
.tt-contribs--authors .tt-contrib-pct { text-align: right; }
.tt-contrib-owner .tt-contrib-name::after { content: ' · owner'; font-weight: 500; font-size: 9px; color: #94a3b8; }

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
.viz-val          { font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #225EA9; min-width: 36px; text-align: right; }
.viz-slider {
  width: 100%; margin: 2px 0 8px;
  height: 4px; border-radius: 2px; appearance: none; cursor: pointer;
  accent-color: #088F9B;
}
.viz-reset-btn {
  width: 100%; margin-top: 2px;
  font-size: 11px; font-weight: 600;
  padding: 5px 10px; border-radius: 8px;
  background: transparent; color: #64748b;
  border: 1.5px solid #cbd5e1; cursor: pointer;
  transition: all 0.15s;
}
.viz-reset-btn:hover { border-color: #225EA9; color: #225EA9; }

/* ── Maximize button ── */
.maximize-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  border: 1.5px solid #cbd5e1; color: #64748b; background: transparent;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
  margin-left: 4px;
}
.maximize-btn:hover { border-color: #225EA9; color: #225EA9; }
</style>
