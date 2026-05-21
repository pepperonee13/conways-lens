<template>
  <div class="graph-wrap" ref="containerRef">
    <div class="graph-header">
      <h3 class="graph-title">Contribution Network</h3>
      <div class="graph-desc-row">
        <p class="graph-desc">
          <span class="legend"><span class="legend-circle"></span>Author</span>
          <span class="legend"><span class="legend-square"></span>Repository</span>
          <span class="legend"><span class="legend-team"></span>Team</span>
          <span class="legend"><span class="legend-folder"></span>Folder</span>
          &nbsp;·&nbsp; Node size = total commits &nbsp;·&nbsp; Drag nodes · Click to expand/collapse
        </p>
        <button v-if="store.teams.length > 0"
                @click="store.crossTeamOnly = !store.crossTeamOnly"
                :class="['cross-team-btn', { active: crossTeamOnly }]">
          <span class="btn-dot"></span>
          Cross-team only
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

    <div v-if="!hasData" class="empty-state">No contribution data to display.</div>

    <template v-else>
      <p class="hint">Scroll to zoom · Drag nodes · Click team/repo/folder nodes to expand or collapse</p>
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
const { graphData, nodeColors, crossTeamOnly, dateBounds, activeRange, expandedTeams, expandedNodes, reposWithFilePaths } = storeToRefs(store);
const { anonymize } = useAnonymize();

const svgRef       = ref(null);
const containerRef = ref(null);
const dims         = reactive({ w: 900, h: 600 });
const tooltip      = reactive({
  show: false, x: 0, y: 0,
  isLink: false,
  name: '', type: '', commits: 0,
  teamName: '', folderPath: '', repoId: '', depth: 0,
  repoCount: 0, authorCount: 0,
  source: '', target: '', action: '',
});

const hasData = computed(() => graphData.value.nodes.length > 0);

const tooltipName = computed(() => {
  if (tooltip.type === 'author') return anonymize(tooltip.name);
  if (tooltip.type === 'team')   return tooltip.teamName;
  if (tooltip.type === 'folder') return tooltip.folderPath;
  return tooltip.name;
});

const tooltipDetail = computed(() => {
  const c = tooltip.commits.toLocaleString();
  if (tooltip.type === 'author') return `Author · ${c} commits`;
  if (tooltip.type === 'team')   return `Team · ${tooltip.repoCount} repos · ${tooltip.authorCount} devs · ${c} commits`;
  if (tooltip.type === 'folder') return `Folder (depth ${tooltip.depth}) · ${c} commits`;
  return `Repository · ${c} commits`;
});

function displayNodeName(id) {
  if (!id) return '';
  if (id.startsWith('team:')) {
    const teamId = id.slice(5);
    const team = store.teams.find(t => t.id === teamId);
    return team?.name ?? id;
  }
  return anonymize(id);
}

const EDGE_COLOR    = '#94a3b8';
const EDGE_OPACITY  = 0.5;
const EDGE_HL_COLOR = '#225EA9';
const DIM_OPACITY   = 0.08;

const savedPositions = {};

let nodeEls = null;
let linkEls = null;
let sim     = null;

function squareEdgeDist(ux, uy, r) {
  const tx = Math.abs(ux) > 1e-9 ? r / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? r / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

// Diamond edge termination for folder nodes
function diamondEdgeDist(ux, uy, r) {
  const d = Math.abs(ux) + Math.abs(uy);
  return d > 1e-9 ? r / d : r;
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

function isNodeExpandable(d) {
  if (d.type === 'team')   return true;
  if (d.type === 'repo')   return reposWithFilePaths.value.has(d.id);
  if (d.type === 'folder') return d.depth < 4;
  return false;
}

function isNodeExpanded(d) {
  if (d.type === 'team')   return expandedTeams.value.has(d.teamId);
  return expandedNodes.value.has(d.id);
}

function handleNodeClick(d) {
  if (d.type === 'team') {
    store.toggleTeamExpansion(d.teamId);
  } else if (d.type === 'repo' && reposWithFilePaths.value.has(d.id)) {
    store.toggleNodeExpansion(d.id);
  } else if (d.type === 'folder' && d.depth < 4) {
    store.toggleNodeExpansion(d.id);
  }
}

function drawGraph() {
  if (!svgRef.value || !hasData.value) return;
  if (sim) { sim.stop(); sim = null; }

  const { nodes: rawNodes, links: rawLinks } = graphData.value;
  const { w, h } = dims;

  const authMax   = d3.max(rawNodes.filter(n => n.type === 'author'), n => n.commits) || 1;
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

  const hullGroup = root.append('g').attr('class', 'team-hulls');

  // Build lookup: author → their teams (for gravity and hull rendering)
  const authorToTeamsMap = {};
  for (const t of store.teams) {
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

  sim = d3.forceSimulation(nodes)
    .force('link',        d3.forceLink(links).id(d => d.id).distance(d => {
      // Longer distance for team-to-team edges so team nodes spread apart
      if (d.source.type === 'team' || d.target.type === 'team') return 280;
      return 200;
    }).strength(0.45))
    .force('charge',      d3.forceManyBody().strength(d => d.type === 'team' ? -1200 : -700))
    .force('center',      d3.forceCenter(w / 2, h / 2).strength(0.05))
    .force('x',           d3.forceX(d => {
      if (d.type === 'author') return w * 0.27;
      // When all nodes are teams (collapsed default view), center them.
      // When mixed with individual authors/repos, pull teams to right-center.
      if (d.type === 'team') {
        const hasIndividuals = nodes.some(n => n.type === 'author' || n.type === 'repo');
        return hasIndividuals ? w * 0.65 : w * 0.5;
      }
      return w * 0.73;
    }).strength(d => d.type === 'team' ? 0.03 : 0.09))
    .force('collide',     d3.forceCollide(d => d.r + (d.type === 'team' ? 30 : 20)))
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
      Object.assign(tooltip, {
        show: true, x: e.clientX + 14, y: e.clientY - 10,
        isLink: true,
        source: d.source.id, target: d.target.id, commits: d.commits,
      });
    })
    .on('mousemove',  e => { tooltip.x = e.clientX + 14; tooltip.y = e.clientY - 10; })
    .on('mouseleave', () => { resetHighlight(); tooltip.show = false; });

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
      let action = '';
      if (d.type === 'team') {
        action = expandedTeams.value.has(d.teamId) ? 'Click to collapse' : 'Click to expand repos';
      } else if (d.type === 'repo' && reposWithFilePaths.value.has(d.id)) {
        action = expandedNodes.value.has(d.id) ? 'Click to collapse' : 'Click to expand folders';
      } else if (d.type === 'folder' && d.depth < 4) {
        action = expandedNodes.value.has(d.id) ? 'Click to collapse' : 'Click to expand subfolders';
      }
      Object.assign(tooltip, {
        show: true, x: e.clientX + 14, y: e.clientY - 10,
        isLink: false,
        name: d.id, type: d.type, commits: d.commits,
        teamName: d.name ?? '', folderPath: d.folderPath ?? '', repoId: d.repoId ?? '',
        depth: d.depth ?? 0, repoCount: d.repoCount ?? 0, authorCount: d.authorCount ?? 0,
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
    .text(d => `${d.repoCount} repos · ${d.authorCount} devs`);

  // Folder nodes — diamond
  nodeEls.filter(d => d.type === 'folder')
    .append('path')
    .attr('d', d => `M0,${-d.r} L${d.r},0 L0,${d.r} L${-d.r},0 Z`)
    .attr('fill', d => store.getNodeColor(d.repoId, 'repo'))
    .attr('stroke', '#fff').attr('stroke-width', 2.5).attr('opacity', 0.88);

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
    .text(d => {
      if (d.type === 'author') return anonymize(d.id);
      if (d.type === 'folder') return d.label || d.folderPath;
      return d.id;
    });

  sim.on('tick', () => {
    nodes.forEach(n => { if (n.x != null) savedPositions[n.id] = { x: n.x, y: n.y }; });

    // Draw hulls around EXPANDED teams (covering their repo and folder nodes)
    if (hasTeams) {
      const teamPtsMap = {};
      const nodeById   = Object.fromEntries(nodes.map(n => [n.id, n]));

      for (const t of store.teams) {
        if (!expandedTeams.value.has(t.id)) continue; // only hull expanded teams

        const teamRepos = new Set(t.repos ?? []);

        for (const n of nodes) {
          if (n.x == null) continue;

          // Include repo nodes and folder nodes belonging to this team
          if (n.type === 'repo' && teamRepos.has(n.id)) {
            (teamPtsMap[t.id] ??= { team: t, pts: [] }).pts.push([n.x, n.y, n.r]);
            // Pull in every author that touches this repo
            for (const link of links) {
              const authorNode = link.source === n || link.source.id === n.id ? null
                : link.target === n || link.target.id === n.id ? nodeById[link.source.id ?? link.source] : null;
              if (!authorNode || authorNode.x == null) continue;
              (teamPtsMap[t.id] ??= { team: t, pts: [] }).pts.push([authorNode.x, authorNode.y, authorNode.r ?? 20]);
            }
          }
          if (n.type === 'folder' && teamRepos.has(n.repoId)) {
            (teamPtsMap[t.id] ??= { team: t, pts: [] }).pts.push([n.x, n.y, n.r]);
          }
          // Include this team's own author nodes
          if (n.type === 'author' && (authorToTeamsMap[n.id] ?? []).some(tm => tm.id === t.id)) {
            (teamPtsMap[t.id] ??= { team: t, pts: [] }).pts.push([n.x, n.y, n.r]);
            // Also pull in all repos this author has edges to
            for (const link of links) {
              const repo = link.source === n || link.source.id === n.id ? link.target : null;
              if (!repo || repo.x == null) continue;
              (teamPtsMap[t.id] ??= { team: t, pts: [] }).pts.push([repo.x, repo.y, repo.r ?? 20]);
            }
          }
        }
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
      const dx  = d.target.x - d.source.x;
      const dy  = d.target.y - d.source.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux  = dx / len, uy = dy / len;

      const srcOffset = d.source.type === 'author'
        ? d.source.r + 3
        : d.source.type === 'team'
          ? squareEdgeDist(ux, uy, d.source.r + 14)
          : d.source.type === 'folder'
            ? diamondEdgeDist(ux, uy, d.source.r) + 2
            : squareEdgeDist(ux, uy, d.source.r) + 2;

      const tgtOffset = d.target.type === 'author'
        ? d.target.r + 3
        : d.target.type === 'team'
          ? squareEdgeDist(ux, uy, d.target.r + 14)
          : d.target.type === 'folder'
            ? diamondEdgeDist(ux, uy, d.target.r) + 2
            : squareEdgeDist(ux, uy, d.target.r) + 2;

      d3.select(this)
        .attr('x1', d.source.x + ux * srcOffset)
        .attr('y1', d.source.y + uy * srcOffset)
        .attr('x2', d.target.x - ux * tgtOffset)
        .attr('y2', d.target.y - uy * tgtOffset);
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
.legend        { @apply flex items-center gap-1.5 font-medium; }
.legend-circle { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #225EA9; }
.legend-square { display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: #088F9B; }
.legend-team   {
  display: inline-block; width: 22px; height: 12px; border-radius: 6px; background: #F08223;
}
.legend-folder {
  display: inline-block; width: 12px; height: 12px; background: #5A4A80;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
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
</style>
