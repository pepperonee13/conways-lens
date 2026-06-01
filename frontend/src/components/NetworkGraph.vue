<template>
  <div :class="['graph-wrap', { 'graph-wrap--fullscreen': isFullscreen }]" ref="containerRef">
    <div class="graph-header">
      <h3 v-if="!isFullscreen" class="graph-title">Team ownership lens</h3>
      <div class="graph-desc-row">
        <template v-if="!isFullscreen && !detailRepoId">
          <p v-if="graphView === 'swimlane'" class="graph-desc">
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
          <p v-else class="graph-desc">
            <span class="legend"><span class="legend-bubble-team"></span>Team</span>
            <span class="legend"><span class="legend-bubble-repo"></span>Bounded Context</span>
            &nbsp;·&nbsp; Bubble size = commit volume &nbsp;·&nbsp; Hover to see cross-team edges &nbsp;·&nbsp; Click a context for author details
          </p>
          <div v-if="effectiveTeams.length > 0" class="view-toggle">
            <button :class="['view-toggle-btn', { active: graphView === 'swimlane' }]" @click="setGraphView('swimlane')">Swimlane</button>
            <button :class="['view-toggle-btn', { active: graphView === 'circlepack' }]" @click="setGraphView('circlepack')">Bubbles</button>
          </div>
        </template>
        <p v-if="!isFullscreen && detailRepoId && folderPath === null" class="graph-desc">
          <span class="legend"><span class="legend-detail-repo"></span>Bounded Context</span>
          <span class="legend"><span class="legend-detail-team"></span>Team (click to expand)</span>
          <span class="legend"><span class="legend-detail-author"></span>Author</span>
          &nbsp;·&nbsp; Edge width = commit volume
          <template v-if="!noFolderData">&nbsp;·&nbsp; Click repo to explore folders</template>
        </p>
        <div v-if="noFolderData" class="no-folder-notice">
          No file path data for this repo — folder drill-down is unavailable.
          <button class="no-folder-dismiss" @click="noFolderData = false">×</button>
        </div>
        <p v-if="!isFullscreen && detailRepoId && folderPath !== null" class="graph-desc">
          <span class="legend"><span class="legend-detail-team"></span>Team (click to expand)</span>
          <span class="legend"><span class="legend-detail-author"></span>Author</span>
          <span class="legend"><span class="legend-folder"></span>Folder (› = drill in)</span>
          &nbsp;·&nbsp; % = share of that folder's commits &nbsp;·&nbsp; Hover to inspect
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
        <div class="export-dropdown-wrap" ref="exportDropRef">
          <button class="maximize-btn"
                  :disabled="!store.dataLoaded || effectiveTeams.length === 0"
                  :title="'Export graph'"
                  @click="exportOpen = !exportOpen">
            <Download :size="14" />
          </button>
          <div v-if="exportOpen" class="export-panel">
            <button class="export-item" @click="exportAs('svg')">
              <span>SVG</span><span class="export-item-hint">vector</span>
            </button>
            <button class="export-item" @click="exportAs('png')">
              <span>PNG</span><span class="export-item-hint">2× raster</span>
            </button>
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
        {{ violationSummary.total === 1 ? 'bounded context violates' : 'bounded contexts violate' }}
        the <strong>{{ violationThreshold }}%</strong> threshold
      </div>
      <template v-if="detailRepoId">
        <!-- Folder drill-down mode -->
        <template v-if="folderPath !== null">
          <div class="detail-header">
            <button class="back-btn" @click="closeDetail">← Back to overview</button>
            <nav class="folder-breadcrumb" aria-label="Folder path">
              <button class="breadcrumb-item breadcrumb-repo" @click="closeFolderMode">{{ detailContextName }}</button>
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
            <span class="detail-title">Contributors to <strong>{{ detailContextName }}</strong></span>
          </div>
          <p v-if="!isFullscreen" class="hint">Scroll to zoom · Hover nodes or edges to inspect · Click the repo to explore folders</p>
        </template>
        <div class="svg-wrap">
          <svg ref="detailSvgRef" class="graph-svg"></svg>
        </div>
      </template>
      <template v-else>
        <p v-if="!isFullscreen" class="hint">
          <template v-if="graphView === 'swimlane'">Scroll to zoom · Hover nodes or edges to inspect · Click a context for author details</template>
          <template v-else>Scroll to zoom · Click a team to expand · Hover to see cross-team edges · Click a context for author details</template>
        </p>
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
          <div class="tt-detail">
            {{ tooltip.commits.toLocaleString() }} commits
            <template v-if="tooltip.pct != null"> · {{ tooltip.pct }}% of <em class="tt-of-folder">{{ displayNodeName(tooltip.target) }}</em>'s commits</template>
          </div>
        </template>
        <template v-else>
          <div class="tt-name">{{ tooltipName }}</div>
          <div v-if="tooltip.type === 'folder' && tooltip.folderFullPath" class="tt-path">{{ tooltip.folderFullPath }}</div>
          <div class="tt-detail">{{ tooltipDetail }}</div>
          <div v-if="tooltip.context === 'folder' && tooltip.folderLastCommit" class="tt-last-commit">last commit {{ tooltip.folderLastCommit }}</div>
          <template v-if="tooltip.repoBreakdown?.length || tooltip.teamInboundBreakdown?.length || tooltip.teamOutboundBreakdown?.length">
            <div class="tt-cb-section">
              <template v-if="tooltip.repoBreakdown?.length">
                <div class="tt-cb-header">Team contributions</div>
                <ul class="tt-cb-list">
                  <li v-for="item in tooltip.repoBreakdown" :key="item.teamId" :class="{ 'tt-contrib-owner': item.isOwner }">
                    <span class="tt-contrib-dot" :style="{ background: teamColorById(item.teamId) }"></span>
                    <span class="tt-contrib-name">{{ teamNameById(item.teamId) }}</span>
                    <span class="tt-contrib-pct">{{ item.pct }}%</span>
                  </li>
                </ul>
              </template>
              <template v-if="tooltip.teamInboundBreakdown?.length">
                <div class="tt-cb-header" :class="{ 'tt-cb-header--gap': tooltip.repoBreakdown?.length }">Contributing to this team's repos</div>
                <ul class="tt-cb-list">
                  <li v-for="item in tooltip.teamInboundBreakdown" :key="item.teamId">
                    <span class="tt-contrib-dot" :style="{ background: teamColorById(item.teamId) }"></span>
                    <span class="tt-contrib-name">{{ teamNameById(item.teamId) }}</span>
                    <span class="tt-contrib-pct">{{ item.pct }}%</span>
                  </li>
                </ul>
              </template>
              <template v-if="tooltip.teamOutboundBreakdown?.length">
                <div class="tt-cb-header" :class="{ 'tt-cb-header--gap': tooltip.teamInboundBreakdown?.length }">This team in other teams' repos</div>
                <ul class="tt-cb-list">
                  <li v-for="item in tooltip.teamOutboundBreakdown" :key="item.teamId">
                    <span class="tt-contrib-dot" :style="{ background: teamColorById(item.teamId) }"></span>
                    <span class="tt-contrib-name">{{ teamNameById(item.teamId) }}</span>
                    <span class="tt-contrib-pct">{{ item.pct }}%</span>
                  </li>
                </ul>
              </template>
            </div>
          </template>
          <ul v-if="tooltip.type === 'repo' && tooltipContributions.length && !tooltip.repoBreakdown" class="tt-contribs">
            <li v-for="c in tooltipContributions" :key="c.teamId"
                :class="{ 'tt-contrib-owner': c.teamId === tooltip.owningTeamId }">
              <span class="tt-contrib-dot" :style="{ background: c.teamColor }"></span>
              <span class="tt-contrib-name">{{ c.teamName }}</span>
              <span class="tt-contrib-pct">{{ c.pct }}%</span>
            </li>
          </ul>
          <div v-if="tooltip.contribsLabel" class="tt-contribs-label">{{ tooltip.contribsLabel }}</div>
          <ul v-if="tooltipDisplayedAuthors.length" class="tt-contribs tt-contribs--authors">
            <li v-for="a in tooltipDisplayedAuthors" :key="a.authorId">
              <span class="tt-contrib-dot" :style="{ background: a.teamColor || '#9CA3AF' }"></span>
              <span class="tt-contrib-name">{{ anonMap[a.authorId] ?? a.authorId }}</span>
              <span class="tt-contrib-pct">{{ a.pct }}%</span>
            </li>
            <li v-if="tooltipHiddenAuthorCount > 0" class="tt-more">+{{ tooltipHiddenAuthorCount }} more</li>
          </ul>
          <template v-if="tooltip.sources?.length">
            <div class="tt-cb-header tt-cb-header--gap">Sources</div>
            <ul class="tt-cb-list">
              <li v-for="src in tooltip.sources" :key="src.key">
                <span class="tt-contrib-name">{{ src.label }}</span>
                <span class="tt-contrib-pct">{{ src.commits.toLocaleString() }}</span>
              </li>
            </ul>
          </template>
          <div v-if="tooltip.action" class="tt-action">{{ tooltip.action }}</div>
        </template>
      </div>
    </teleport>

    <teleport to="body">
      <template v-if="contextMenu.show">
        <div class="ctx-menu-backdrop" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
        <div class="ctx-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
          <div class="ctx-menu-label">{{ contextMenu.label }}</div>

          <template v-if="contextMenu.source">
            <template v-if="contexts.length">
              <div class="ctx-menu-section-header">
                {{ contextMenu.currentContextId ? 'Change context' : 'Add to context' }}
              </div>
              <button
                v-for="c in contexts" :key="c.id"
                class="ctx-menu-item ctx-menu-item--context"
                :class="{ 'ctx-menu-item--current': c.id === contextMenu.currentContextId }"
                @click="assignToContext(c.id)"
              >
                <span class="ctx-menu-check">{{ c.id === contextMenu.currentContextId ? '✓' : '' }}</span>
                {{ c.name }}
              </button>
              <div class="ctx-menu-divider"></div>
            </template>
            <button class="ctx-menu-item ctx-menu-item--new" @click="confirmAddToContext">
              + Create new context…
            </button>
          </template>

          <template v-else>
            <div class="ctx-menu-reason">{{ contextMenu.reason }}</div>
          </template>
        </div>
      </template>
    </teleport>

    <!-- Toast notifications -->
    <teleport to="body">
      <div class="toast-stack">
        <transition-group name="toast">
          <div v-for="t in toasts" :key="t.id" class="toast">{{ t.message }}</div>
        </transition-group>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { Maximize2, Minimize2, Download } from '@lucide/vue';
import { useLensStore } from '../stores/useLensStore';
import { useSwimlaneGraph } from '../composables/graphs/useSwimlaneGraph.js';
import { useCirclePackGraph } from '../composables/graphs/useCirclePackGraph.js';
import { useContextAuthorGraph } from '../composables/graphs/useContextAuthorGraph.js';
import { useRepoFolderGraph } from '../composables/graphs/useRepoFolderGraph.js';
import { useContextNavigation } from '../composables/useContextNavigation.js';
import { useAnonymize } from '../composables/useAnonymize.js';
import { useGraphTooltip } from '../composables/useGraphTooltip.js';
import { useGraphContextMenu } from '../composables/useGraphContextMenu.js';
import { useGraphExport } from '../composables/useGraphExport.js';
import { useGraphFullscreen } from '../composables/useGraphFullscreen.js';
import { isContextViolating } from '../domain/violations.js';
import { useToast } from '../composables/useToast.js';

const store = useLensStore();
const {
  ownershipGraphData, nodeColors,
  dateBounds, activeRange, syntheticTeam,
  allContexts, contexts,
  vizSettings,
} = storeToRefs(store);

const { toasts } = useToast();

const effectiveTeams = computed(() =>
  syntheticTeam.value ? [...store.teams, syntheticTeam.value] : store.teams
);

const svgRef       = ref(null);
const detailSvgRef = ref(null);
const containerRef = ref(null);
const vizDropRef   = ref(null);
const dims         = reactive({ w: 900, h: 600 });
const detailRepoId    = ref(null);
const detailSourceKey = ref(null); // null = whole context, otherwise source key
const folderPath      = ref(null); // null = author view, [] = folder root, ['src'] = inside src/

const detailContextName = computed(() => {
  const id = detailRepoId.value;
  if (!id) return null;
  return allContexts.value.find(c => c.id === id)?.name ?? id;
});

// Accepts any source type (repo/path/glob); for auto-contexts (id === repoName) returns id.
// When a source key is active, extract the repo from it for folder drill-down.
const detailRepoName = computed(() => {
  const srcKey = detailSourceKey.value;
  if (srcKey) {
    const parts = srcKey.split('|');
    return parts[1] ?? detailRepoId.value;
  }
  const id = detailRepoId.value;
  if (!id) return null;
  const ctx = allContexts.value.find(c => c.id === id);
  const src = (ctx?.sources ?? []).find(s => s.repo);
  return src?.repo ?? id;
});

const noFolderData = ref(false);

const vizOpen = ref(false);

const graphView = computed({
  get: () => vizSettings.value.graphView,
  set: v  => { vizSettings.value = { ...vizSettings.value, graphView: v }; },
});
const edgeWeight = computed({
  get: () => vizSettings.value.edgeWeight,
  set: v  => { vizSettings.value = { ...vizSettings.value, edgeWeight: v }; },
});
const violationThreshold = computed({
  get: () => vizSettings.value.violationThreshold,
  set: v  => { vizSettings.value = { ...vizSettings.value, violationThreshold: v }; },
});
const violatingOnly = computed({
  get: () => vizSettings.value.violatingOnly,
  set: v  => { vizSettings.value = { ...vizSettings.value, violatingOnly: v }; },
});
const displayAuthors = computed({
  get: () => vizSettings.value.displayAuthors,
  set: v  => { vizSettings.value = { ...vizSettings.value, displayAuthors: v }; },
});

const violationSummary = computed(() => {
  const threshold = violationThreshold.value;
  const contexts  = ownershipGraphData.value.nodes.filter(n => n.type === 'context');
  const violating = contexts.filter(r => isContextViolating(r, threshold)).length;
  return { violating, total: contexts.length };
});

function resetVizDefaults() {
  const prevView = graphView.value;
  store.resetVizSettings();
  if (graphView.value !== prevView) nextTick(() => redraw());
}

// ── Composables ───────────────────────────────────────────────────────────

const { isFullscreen, toggleFullscreen } = useGraphFullscreen({ containerRef, dims });

const { exportOpen, exportDropRef, exportAs } = useGraphExport({
  svgRef, detailSvgRef, detailRepoId, dims,
});

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

const {
  tooltip,
  tooltipName, tooltipDetail, tooltipContributions,
  tooltipDisplayedAuthors, tooltipHiddenAuthorCount,
  teamNameById, teamColorById, displayNodeName,
} = useGraphTooltip({ effectiveTeams, allContexts, anonMap, violationThreshold });

const {
  contextMenu,
  closeContextMenu,
  openContextMenuForContextNode,
  openContextMenuForFolderNode,
  assignToContext,
  confirmAddToContext,
} = useGraphContextMenu({ store, detailRepoName });

// ── Renderers ─────────────────────────────────────────────────────────────

const renderer = useSwimlaneGraph({
  svgRef,
  effectiveTeams,
  getNodeColor: store.getNodeColor,
  onShowNodeTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      anchorRight: d.type === 'team',
      name: d.id, type: d.type, commits: d.commits,
      teamName: d.name ?? '', contextCount: d.contextCount ?? 0, authorCount: d.authorCount ?? 0,
      action: d.type === 'context' ? 'Click to explore in Bubbles view' : '',
      contributions: d.contributions ?? [],
      owningTeamId: d.owningTeamId ?? null,
      authorContributions: displayAuthors.value && (d.type === 'context' || d.type === 'team') ? d.authorContributions ?? null : null,
      folderLastCommit: null, folderFullPath: null, context: '',
      teamInboundBreakdown: null, teamOutboundBreakdown: null, repoBreakdown: null,
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
  onNodeClick: (d) => switchToBubblesForContext(d.id),
  onNodeContextMenu: (d, e) => openContextMenuForContextNode(d, e),
  edgeWeight,
  violationThreshold,
  violatingOnly,
});

const circlePackRenderer = useCirclePackGraph({
  svgRef,
  effectiveTeams,
  onShowNodeTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      anchorRight: d.type === 'team',
      name: d.id, type: d.type, commits: d.commits,
      teamName: d.name ?? '', contextCount: d.contextCount ?? 0, authorCount: d.authorCount ?? 0,
      action: d.action ?? (d.type === 'context' ? 'Click to see author contributions' : ''),
      contributions: d.contributions ?? [],
      owningTeamId: d.owningTeamId ?? null,
      authorContributions: displayAuthors.value && (d.type === 'context' || d.type === 'team') ? d.authorContributions ?? null : null,
      folderLastCommit: null, folderFullPath: null, context: '',
      teamInboundBreakdown: d.teamInboundBreakdown ?? null,
      teamOutboundBreakdown: d.teamOutboundBreakdown ?? null,
      repoBreakdown: d.repoBreakdown ?? null,
      sources: d.sources ?? null,
    });
  },
  onMoveTooltip: (x, y) => { tooltip.x = x; tooltip.y = y; },
  onHideTooltip: () => { tooltip.show = false; tooltip.anchorRight = false; tooltip.sources = null; },
  onNodeClick: (d) => openDetail(d),
  onNodeContextMenu: (d, e) => openContextMenuForContextNode(d, e),
  violationThreshold,
  violatingOnly,
  edgeWeight,
  getContextSources: (contextId) => store.contextSourceData(contextId),
});

const detailRenderer = useContextAuthorGraph({
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
      teamName: d.teamName ?? '', contextCount: 0, authorCount: d.authors?.length ?? 0,
      action: d.action ?? '', contributions: d.contributions ?? [], owningTeamId: d.owningTeamId ?? null,
      authorContributions: d.authorContributions ?? null,
      teamInboundBreakdown: null, teamOutboundBreakdown: null, repoBreakdown: null,
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

const folderRenderer = useRepoFolderGraph({
  svgRef: detailSvgRef,
  effectiveTeams,
  getNodeColor: store.getNodeColor,
  anonMap,
  violationThreshold,
  onFolderClick: (segmentId) => drillDown(segmentId),
  onNodeContextMenu: (d, e) => openContextMenuForFolderNode(d, e),
  onShowNodeTooltip: (d, x, y) => {
    Object.assign(tooltip, {
      show: true, x, y, isLink: false,
      name: d.id, type: d.type, commits: d.commits, pct: d.pct ?? null,
      teamName: d.teamName ?? '', contextCount: 0, authorCount: d.authors?.length ?? 0,
      action: d.action ?? '', contributions: [], owningTeamId: null,
      authorContributions: d.authorContributions ?? null,
      folderFullPath: d.folderFullPath ?? null,
      folderLastCommit: d.folderLastCommit ?? null,
      context: 'folder',
      contribsLabel: d.type === 'team-collapsed' ? "each dev's share of this level's commits:" : null,
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
  onHideTooltip: () => { tooltip.show = false; tooltip.context = ''; tooltip.contribsLabel = null; },
  edgeWeight,
});

// ── URL Navigation ────────────────────────────────────────────────────────

const nav = useContextNavigation({
  graphView,
  onRestoreState: () => {
    // Restore state from URL on page load — handled in onMounted
  },
});

// ── Navigation ────────────────────────────────────────────────────────────

function openDetail(contextId, srcKey = null) {
  folderRenderer.teardown();
  folderPath.value = null;
  noFolderData.value = false;
  detailRepoId.value = contextId;
  detailSourceKey.value = srcKey;
  nav.openContext(contextId);
  nextTick(() => {
    const data = store.contextContributorsData(contextId);
    detailRenderer.draw({ dims, data });
  });
}

function openDetailForSource(contextId, srcKey) {
  folderRenderer.teardown();
  folderPath.value = null;
  noFolderData.value = false;
  detailRepoId.value = contextId;
  detailSourceKey.value = srcKey;
  nav.openSource(contextId, srcKey);
  nextTick(() => {
    const data = store.sourceContributorsData(contextId, srcKey);
    detailRenderer.draw({ dims, data });
  });
}

function switchToBubblesForContext(contextId) {
  const owningTeamId = store.teams.find(t => (t.contexts ?? []).includes(contextId))?.id;
  graphView.value = 'circlepack';
  nextTick(() => {
    renderer.teardown();
    if (owningTeamId) circlePackRenderer.expandTeam(owningTeamId);
    circlePackRenderer.draw({ dims, data: ownershipGraphData.value });
  });
}

function closeDetail() {
  detailRenderer.teardown();
  folderRenderer.teardown();
  folderPath.value = null;
  detailRepoId.value = null;
  detailSourceKey.value = null;
  nav.closeDetail();
  nextTick(() => redraw());
}

function openFolderMode() {
  const probe = store.repoFolderData(detailRepoName.value, '');
  if (!probe.nodes.some(n => n.type === 'folder')) {
    noFolderData.value = true;
    return;
  }
  noFolderData.value = false;
  detailRenderer.teardown();
  folderPath.value = [];
  nav.openFolder([]);
  nextTick(() => redrawFolder());
}

function closeFolderMode() {
  folderRenderer.teardown();
  folderPath.value = null;
  if (detailSourceKey.value) {
    nav.openSource(detailRepoId.value, detailSourceKey.value);
  } else {
    nav.openContext(detailRepoId.value);
  }
  nextTick(() => {
    const data = detailSourceKey.value
      ? store.sourceContributorsData(detailRepoId.value, detailSourceKey.value)
      : store.contextContributorsData(detailRepoId.value);
    detailRenderer.draw({ dims, data });
  });
}

function drillDown(segmentId) {
  folderPath.value = [...folderPath.value, segmentId];
  nav.openFolder(folderPath.value);
  redrawFolder();
}

function breadcrumbNavigate(index) {
  folderPath.value = folderPath.value.slice(0, index + 1);
  nav.openFolder(folderPath.value);
  redrawFolder();
}

function redrawFolder() {
  const prefix = (folderPath.value ?? []).join('/');
  const data = store.repoFolderData(detailRepoName.value, prefix);
  folderRenderer.draw({ dims, data });
}

// ── Render ────────────────────────────────────────────────────────────────

function redraw() {
  if (graphView.value === 'circlepack') {
    renderer.teardown();
    circlePackRenderer.draw({ dims, data: ownershipGraphData.value });
  } else {
    circlePackRenderer.teardown();
    renderer.draw({ dims, data: ownershipGraphData.value });
  }
}

function setGraphView(view) {
  if (graphView.value === view) return;
  graphView.value = view;
  nextTick(() => redraw());
}

watch(ownershipGraphData, () => redraw(), { deep: true, flush: 'post' });
watch(dims,               () => redraw(), { flush: 'post' });
watch(edgeWeight, () => {
  if (detailRepoId.value) {
    (folderPath.value !== null ? folderRenderer : detailRenderer).updateEdgeStyles();
  } else if (graphView.value === 'circlepack') {
    redraw();
  } else {
    renderer.updateEdgeStyles();
  }
});
watch(nodeColors, () => {
  if (graphView.value === 'swimlane') renderer.updateNodeColors();
});
watch(violationThreshold, () => {
  if (detailRepoId.value) {
    if (folderPath.value !== null) redrawFolder();
    else openDetail(detailRepoId.value);
  } else if (violatingOnly.value || graphView.value === 'circlepack') redraw();
  else renderer.drawOverlays();
});
watch(violatingOnly, () => redraw());

// ── Lifecycle ─────────────────────────────────────────────────────────────

function handleDocClick(e) {
  if (vizOpen.value && vizDropRef.value && !vizDropRef.value.contains(e.target))
    vizOpen.value = false;
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocClick);
  if (nav.contextId.value) {
    const restoredFolderPath = nav.folderPath.value;
    nextTick(() => {
      openDetail(nav.contextId.value, nav.sourceKey.value ?? null);
      if (restoredFolderPath !== null) {
        nextTick(() => {
          const probe = store.repoFolderData(detailRepoName.value, '');
          if (probe.nodes.some(n => n.type === 'folder')) {
            detailRenderer.teardown();
            folderPath.value = restoredFolderPath;
            redrawFolder();
          }
        });
      }
    });
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocClick);
  renderer.teardown();
  circlePackRenderer.teardown();
  detailRenderer.teardown();
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
  padding: 12px !important;
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
.no-folder-notice {
  @apply text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 flex items-center gap-2;
}
.no-folder-dismiss { @apply ml-auto text-amber-500 hover:text-amber-700 font-bold leading-none; }
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

/* Right-click "Add to bounded context" menu */
.ctx-menu-backdrop { @apply fixed inset-0; z-index: 10000; }
.ctx-menu {
  @apply fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 text-sm overflow-hidden;
  z-index: 10001; min-width: 200px;
  animation: fadeIn 0.1s ease-out forwards;
}
.ctx-menu-label {
  @apply px-3 py-1.5 text-xs font-mono text-gray-500 border-b border-gray-100 truncate max-w-[260px];
}
.ctx-menu-section-header {
  @apply px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400;
}
.ctx-menu-item {
  @apply w-full text-left px-3 py-2 font-medium text-gray-700 hover:bg-orange-50 hover:text-brand-orange
         transition-colors cursor-pointer;
}
.ctx-menu-item--context {
  @apply flex items-center gap-2 pl-3 pr-3 text-sm;
}
.ctx-menu-item--current {
  @apply text-brand-teal font-semibold;
}
.ctx-menu-check {
  @apply w-3 text-brand-teal font-bold flex-shrink-0 text-xs;
}
.ctx-menu-item--new {
  @apply text-gray-500 hover:text-brand-orange text-sm;
}
.ctx-menu-divider { @apply border-t border-gray-100 my-1; }
.ctx-menu-item:disabled { @apply text-gray-300 cursor-not-allowed hover:bg-transparent hover:text-gray-300; }
.ctx-menu-reason { @apply px-3 py-2 text-[11px] text-gray-400 italic; }

/* Toast notifications */
.toast-stack {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  z-index: 20000; display: flex; flex-direction: column; gap: 8px; align-items: center;
  pointer-events: none;
}
.toast {
  background: #1f2937; color: #f9fafb;
  padding: 10px 18px; border-radius: 8px;
  font-size: 13px; font-weight: 500; white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}
.toast-enter-active { transition: all 0.2s ease-out; }
.toast-leave-active { transition: all 0.25s ease-in; }
.toast-enter-from  { opacity: 0; transform: translateY(8px); }
.toast-leave-to   { opacity: 0; transform: translateY(-6px); }
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
.tt-name    { @apply font-bold text-brand-gray text-base; }
.tt-cb-section { margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
.tt-cb-header { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.tt-cb-header--gap { margin-top: 8px; }
.tt-cb-list { margin: 0; padding: 0; list-style: none; }
.tt-cb-list li { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: 6px; font-size: 11px; line-height: 1.75; color: #374151; }
.tt-path        { @apply text-gray-400 text-xs font-mono mt-0.5; }
.tt-last-commit    { @apply text-gray-400 text-xs mt-0.5; }
.tt-contribs-label { @apply text-gray-400 text-xs mt-1.5 mb-0.5; }
.tt-detail { @apply text-gray-500 text-xs mt-0.5; }
.tt-of-folder { font-style: normal; color: var(--brand-blue); font-weight: 600; }
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
.tt-more { color: #94a3b8; font-size: 10px; grid-column: 1 / -1; padding-top: 1px; white-space: nowrap; }

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

/* ── View toggle (Swimlane / Bubbles) ── */
.view-toggle {
  display: flex; border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden;
  flex-shrink: 0;
}
.view-toggle-btn {
  font-size: 11px; font-weight: 600; padding: 3px 12px;
  background: transparent; color: #64748b; border: none; cursor: pointer;
  transition: background 0.12s, color 0.12s;
  line-height: 1.6;
}
.view-toggle-btn + .view-toggle-btn { border-left: 1.5px solid #cbd5e1; }
.view-toggle-btn.active { background: #225EA9; color: #fff; }
.view-toggle-btn:not(.active):hover { background: #f1f5f9; color: #225EA9; }

.legend-bubble-team {
  display: inline-block; width: 18px; height: 18px; border-radius: 50%;
  background: rgba(240,130,35,0.13); border: 2px dashed rgba(240,130,35,0.6);
}
.legend-bubble-repo {
  display: inline-block; width: 12px; height: 12px; border-radius: 50%;
  background: #F08223; opacity: 0.78;
}

/* ── Maximize button ── */
.maximize-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  border: 1.5px solid #cbd5e1; color: #64748b; background: transparent;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
  margin-left: 4px;
}
.maximize-btn:hover:not(:disabled) { border-color: #225EA9; color: #225EA9; }
.maximize-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Export dropdown ── */
.export-dropdown-wrap { position: relative; margin-left: 4px; }
.export-panel {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 200;
  background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10); overflow: hidden; min-width: 130px;
  animation: fadeIn 0.12s ease-out;
}
.export-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 8px 14px;
  font-size: 12px; font-weight: 600; color: #374151;
  background: transparent; border: none; cursor: pointer; text-align: left;
  transition: background 0.1s;
}
.export-item:hover { background: #f1f5f9; color: #225EA9; }
.export-item-hint { font-size: 10px; font-weight: 400; color: #9ca3af; }
</style>
