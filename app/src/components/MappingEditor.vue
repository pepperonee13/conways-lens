<template>
  <button class="floating-mapping-btn" v-if="!open" @click="open = true" title="Edit mappings">
    <span>🗺</span>
    <span>Mapping</span>
    <span v-if="teams.length" class="badge">{{ teams.length }}</span>
  </button>

  <transition name="backdrop-fade">
    <div v-if="open" class="backdrop" @click="open = false"></div>
  </transition>

  <transition name="slide-panel">
    <div v-if="open" class="panel">
      <div class="panel-header">
        <h2 class="panel-title">🗺 Team Mapping</h2>
        <button class="close-btn" @click="open = false">✕</button>
      </div>

      <div class="panel-tabs">
        <button :class="['tab-btn', { active: tab === 'teams' }]"   @click="tab = 'teams'">Teams</button>
        <button :class="['tab-btn', { active: tab === 'aliases' }]" @click="tab = 'aliases'">
          Author Aliases
          <span v-if="normalizationCount" class="tab-badge">{{ normalizationCount }}</span>
        </button>
        <button :class="['tab-btn', { active: tab === 'ignored' }]" @click="tab = 'ignored'">
          Ignored
          <span v-if="ignoredAuthors.length" class="tab-badge tab-badge--red">{{ ignoredAuthors.length }}</span>
        </button>
      </div>

      <div class="panel-body">

        <!-- ── Teams ── -->
        <template v-if="tab === 'teams'">
          <p class="panel-hint">
            Assign authors and repositories to teams. Team color is applied to their nodes in the graph.
          </p>

          <button class="add-team-btn" @click="addTeam()">+ Add Team</button>

          <div class="teams-list">
            <div
              v-for="(team, idx) in teams"
              :key="team.id"
              :class="['team-card', { 'team-card--drop-target': dropTargetTeamId === team.id }]"
              @dragover.prevent="onTeamDragOver(team.id)"
              @dragleave="onTeamDragLeave(team.id, $event)"
              @drop.prevent="onTeamDrop(team)"
            >
              <div class="team-card-header">
                <button class="team-toggle" @click="toggleTeam(team.id)" :title="isExpanded(team.id) ? 'Collapse' : 'Expand'">
                  <span class="chevron" :class="{ rotated: isExpanded(team.id) }">›</span>
                </button>
                <input type="color" v-model="team.color" class="color-picker" :title="team.color" />
                <input v-model="team.name" class="team-name-input" :placeholder="'Team ' + (idx + 1)" />
                <span v-if="!isExpanded(team.id)" class="team-summary">
                  {{ team.authors.length }} authors · {{ team.repos.length }} repos
                </span>
                <button class="remove-team-btn" @click="store.removeTeam(team.id)" title="Delete team">✕</button>
              </div>

              <transition name="team-body">
                <div v-if="isExpanded(team.id)" class="team-body">
                  <div class="section-label">Authors ({{ team.authors.length }})</div>
                  <div class="assigned-chips">
                    <span v-for="a in [...team.authors].sort()" :key="a" class="assigned-chip author-chip">
                      {{ anonymize(a) }}<button class="chip-remove" @click="removeFrom(team, 'authors', a)">×</button>
                    </span>
                    <span v-if="!team.authors.length" class="empty-hint">No authors assigned</span>
                  </div>
                  <div class="available-list" v-if="availableAuthorGroups(team).free.length || availableAuthorGroups(team).shared.length">
                    <template v-if="availableAuthorGroups(team).free.length">
                      <div class="available-label">Add author:</div>
                      <div class="available-pills">
                        <button v-for="a in availableAuthorGroups(team).free" :key="a" class="available-pill" @click="addTo(team, 'authors', a)">
                          + {{ anonymize(a) }}
                        </button>
                      </div>
                    </template>
                    <template v-if="availableAuthorGroups(team).shared.length">
                      <div class="available-label available-label--shared">Also in another team:</div>
                      <div class="available-pills">
                        <button v-for="a in availableAuthorGroups(team).shared" :key="a" class="available-pill available-pill--shared" @click="addTo(team, 'authors', a)">
                          + {{ anonymize(a) }}
                        </button>
                      </div>
                    </template>
                  </div>

                  <div class="section-label">Repositories ({{ team.repos.length }})</div>
                  <div class="assigned-chips">
                    <span v-for="r in [...team.repos].sort()" :key="r" class="assigned-chip repo-chip">
                      {{ r }}<button class="chip-remove" @click="removeFrom(team, 'repos', r)">×</button>
                    </span>
                    <span v-if="!team.repos.length" class="empty-hint">No repositories assigned</span>
                  </div>
                  <div class="available-list" v-if="availableRepos(team).length">
                    <div class="available-label">Add repository:</div>
                    <div class="available-pills">
                      <button v-for="r in availableRepos(team)" :key="r" class="available-pill repo-pill" @click="addTo(team, 'repos', r)">
                        + {{ r }}
                      </button>
                    </div>
                  </div>
                </div>
              </transition>
            </div>
          </div>

          <div v-if="!teams.length" class="no-teams">
            <p>No teams defined yet.</p>
            <p>Click <strong>+ Add Team</strong> to create your first team, then assign authors and repositories to it.</p>
            <p class="hint-text">Authors and repositories are discovered automatically from the loaded data.</p>
          </div>

          <div v-if="teams.length && (unassignedAuthors.length || unassignedRepos.length)" class="unassigned-section">
            <div class="unassigned-title">⚠ Unassigned</div>
            <div class="unassigned-hint">Tip: drag any item below onto a team card to assign it.</div>
            <div v-if="unassignedAuthors.length" class="unassigned-group">
              <span class="unassigned-label">Authors not in any team:</span>
              <span
                v-for="a in unassignedAuthors"
                :key="a"
                :class="['unassigned-chip', 'unassigned-chip--draggable', { 'unassigned-chip--dragging': unassignedDrag?.kind === 'authors' && unassignedDrag?.value === a }]"
                draggable="true"
                @dragstart="onUnassignedDragStart('authors', a, $event)"
                @dragend="onUnassignedDragEnd"
              >{{ anonymize(a) }}</span>
            </div>
            <div v-if="unassignedRepos.length" class="unassigned-group">
              <span class="unassigned-label">Repositories not in any team:</span>
              <span
                v-for="r in unassignedRepos"
                :key="r"
                :class="['unassigned-chip', 'unassigned-chip--draggable', { 'unassigned-chip--dragging': unassignedDrag?.kind === 'repos' && unassignedDrag?.value === r }]"
                draggable="true"
                @dragstart="onUnassignedDragStart('repos', r, $event)"
                @dragend="onUnassignedDragEnd"
              >{{ r }}</span>
            </div>
          </div>
        </template>

        <!-- ── Author Aliases ── -->
        <template v-if="tab === 'aliases'">
          <p class="panel-hint">
            Drag an author pill onto another to alias it. The pill you drop onto becomes the canonical name.
            Useful when the same person appears under multiple git identities.
          </p>

          <div class="author-pills-grid">
            <div
              v-for="author in allRawAuthors"
              :key="author"
              :class="['author-pill', {
                'pill-mapped':       isMapped(author),
                'pill-dragging':     dragSource === author,
                'pill-drop-target':  dragTarget === author,
              }]"
              draggable="true"
              @dragstart="dragSource = author"
              @dragend="dragSource = null; dragTarget = null"
              @dragover.prevent="onDragOver(author)"
              @dragleave.self="onDragLeave(author)"
              @drop.prevent="onDrop(author)"
            >
              <span class="pill-name">{{ anonymize(author) }}</span>
              <span v-if="isMapped(author)" class="pill-alias-badge">→ {{ anonymize(authorNormalizations[author]) }}</span>
            </div>
          </div>

          <template v-if="normalizationCount">
            <div class="section-label" style="margin-top:1.25rem">Active aliases ({{ normalizationCount }})</div>
            <div class="alias-list">
              <div v-for="[raw, canonical] in sortedNormalizations" :key="raw" class="alias-row">
                <span class="alias-raw">{{ anonymize(raw) }}</span>
                <span class="alias-arrow-sm">→</span>
                <span class="alias-canonical">{{ anonymize(canonical) }}</span>
                <button class="alias-remove" @click="store.removeNormalization(raw)" title="Remove alias">✕</button>
              </div>
            </div>
          </template>
          <p v-else class="hint-text" style="margin-top:0.75rem;text-align:center">
            No aliases yet — drag one pill onto another to create one.
          </p>
        </template>

        <!-- ── Ignored Authors ── -->
        <template v-if="tab === 'ignored'">
          <p class="panel-hint">
            Click a pill to ignore an author (removes them from the graph entirely). Uses canonical names (after alias mappings are applied).
          </p>

          <template v-if="ignoredAuthorsSorted.length">
            <div class="section-label section-label--ignored">Ignored ({{ ignoredAuthorsSorted.length }})</div>
            <div class="author-pills-grid ignored-group">
              <button
                v-for="a in ignoredAuthorsSorted"
                :key="a"
                class="author-pill author-pill--ignored"
                @click="store.unignoreAuthor(a)"
                title="Click to unignore"
              >
                <span class="pill-name">{{ anonymize(a) }}</span>
                <span class="pill-x">✕</span>
              </button>
            </div>
          </template>

          <div v-if="activeAuthors.length" class="section-label" :class="{ 'mt-5': ignoredAuthorsSorted.length }">
            Active ({{ activeAuthors.length }})
          </div>
          <div class="author-pills-grid">
            <button
              v-for="a in activeAuthors"
              :key="a"
              class="author-pill author-pill--active"
              @click="store.ignoreAuthor(a)"
              title="Click to ignore"
            >
              <span class="pill-name">{{ anonymize(a) }}</span>
            </button>
          </div>

          <p v-if="!allAuthors.length" class="hint-text" style="text-align:center;margin-top:2rem">
            No authors found. Upload a CSV first.
          </p>
        </template>

      </div>

      <!-- ── Footer: Import / Export ── -->
      <div class="panel-footer">
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleImport" />
        <span v-if="importError" class="import-error">{{ importError }}</span>
        <button class="footer-btn footer-btn--secondary" @click="fileInput.click()">⬆ Import JSON</button>
        <button class="footer-btn footer-btn--primary"   @click="handleExport">⬇ Export JSON</button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';
import { useAnonymize } from '../composables/useAnonymize.js';

const store = useLensStore();
const { teams, authorNormalizations, ignoredAuthors, allRawAuthors, allAuthors, allRepos } = storeToRefs(store);
const { anonymize } = useAnonymize();

const open = ref(false);
const tab  = ref('teams');

// ── Teams ──
const expandedTeams = ref(new Set());
function isExpanded(id) { return expandedTeams.value.has(id); }
function toggleTeam(id) {
  const s = new Set(expandedTeams.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expandedTeams.value = s;
}
function addTeam() {
  store.addTeam();
  const newTeam = teams.value[teams.value.length - 1];
  if (newTeam) expandedTeams.value = new Set([...expandedTeams.value, newTeam.id]);
}

const ignoredSet = computed(() => new Set(ignoredAuthors.value));

function availableAuthorGroups(team) {
  const otherTeamAuthors = new Set(
    teams.value.filter(t => t.id !== team.id).flatMap(t => t.authors)
  );
  const free = [], shared = [];
  for (const a of allAuthors.value) {
    if (team.authors.includes(a) || ignoredSet.value.has(a)) continue;
    (otherTeamAuthors.has(a) ? shared : free).push(a);
  }
  return { free, shared };
}

function availableRepos(team) {
  const takenElsewhere = new Set(
    teams.value.filter(t => t.id !== team.id).flatMap(t => t.repos)
  );
  return allRepos.value.filter(r => !team.repos.includes(r) && !takenElsewhere.has(r));
}
function addTo(team, field, value) {
  if (!team[field].includes(value)) team[field].push(value);
}
function removeFrom(team, field, value) {
  team[field] = team[field].filter(v => v !== value);
}

const unassignedAuthors = computed(() => {
  const assigned = new Set(teams.value.flatMap(t => t.authors));
  return allAuthors.value.filter(a => !assigned.has(a));
});
const unassignedRepos = computed(() => {
  const assigned = new Set(teams.value.flatMap(t => t.repos));
  return allRepos.value.filter(r => !assigned.has(r));
});

// ── Drag unassigned author/repo → team ──
const unassignedDrag = ref(null); // { kind: 'authors' | 'repos', value: string }
const dropTargetTeamId = ref(null);

function onUnassignedDragStart(kind, value, e) {
  unassignedDrag.value = { kind, value };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', value);
  }
}
function onUnassignedDragEnd() {
  unassignedDrag.value = null;
  dropTargetTeamId.value = null;
}
function onTeamDragOver(teamId) {
  if (unassignedDrag.value) dropTargetTeamId.value = teamId;
}
function onTeamDragLeave(teamId, e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  if (dropTargetTeamId.value === teamId) dropTargetTeamId.value = null;
}
function onTeamDrop(team) {
  const drag = unassignedDrag.value;
  if (drag) addTo(team, drag.kind, drag.value);
  unassignedDrag.value = null;
  dropTargetTeamId.value = null;
}

// ── Author Aliases ──
const dragSource = ref(null);
const dragTarget = ref(null);

const normalizationCount = computed(() => Object.keys(authorNormalizations.value).length);
const sortedNormalizations = computed(() =>
  Object.entries(authorNormalizations.value).sort(([a], [b]) => a.localeCompare(b))
);

function isMapped(author) { return author in authorNormalizations.value; }

function onDragOver(author) { if (author !== dragSource.value) dragTarget.value = author; }
function onDragLeave(author) { if (dragTarget.value === author) dragTarget.value = null; }

function onDrop(canonical) {
  if (dragSource.value && dragSource.value !== canonical)
    store.setNormalization(dragSource.value, canonical);
  dragSource.value = null;
  dragTarget.value = null;
}

// ── Ignored Authors ──
function isIgnored(name) { return ignoredAuthors.value.includes(name); }
const ignoredAuthorsSorted = computed(() =>
  allAuthors.value.filter(isIgnored).sort((a, b) => a.localeCompare(b))
);
const activeAuthors = computed(() =>
  allAuthors.value.filter(a => !isIgnored(a))
);

// ── Import / Export ──
const fileInput   = ref(null);
const importError = ref('');

function handleExport() {
  const blob = new Blob([store.exportMappings()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'conwaylens-mappings.json' });
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImport(e) {
  importError.value = '';
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    store.importMappings(JSON.parse(text));
    e.target.value = '';
  } catch (err) {
    importError.value = err.message;
  }
}
</script>

<style scoped>
.floating-mapping-btn {
  @apply fixed right-6 bottom-6 z-40 bg-gradient-to-r from-brand-orange-dark to-brand-orange
         text-white rounded-full shadow-2xl px-6 py-4 font-bold text-base cursor-pointer
         transition-all duration-300 hover:scale-110 flex items-center gap-3;
}
.badge {
  @apply bg-white text-brand-orange text-xs font-bold px-2.5 py-1 rounded-full ml-1;
}

.backdrop {
  @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40;
}
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }

.panel {
  @apply fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 520px; max-width: 95vw;
}
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(100%); }

.panel-header {
  @apply bg-gradient-to-r from-brand-orange-dark to-brand-orange text-white
         px-6 py-5 flex items-center justify-between shadow-lg flex-shrink-0;
}
.panel-title { @apply text-2xl font-bold m-0; }
.close-btn {
  @apply text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center
         justify-center text-2xl font-bold transition-all duration-200 cursor-pointer;
}

.panel-tabs { @apply flex border-b border-gray-200 flex-shrink-0 bg-white; }
.tab-btn {
  @apply flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-brand-orange
         transition-colors duration-150 relative flex items-center justify-center gap-1.5 cursor-pointer;
}
.tab-btn.active { @apply text-brand-orange border-b-2 border-brand-orange -mb-px; }
.tab-badge {
  @apply bg-brand-orange text-white text-xs font-bold px-2 py-0.5 rounded-full;
}
.tab-badge--red { @apply bg-red-500; }

.panel-body {
  @apply flex-1 overflow-y-auto p-5;
  scrollbar-width: thin; scrollbar-color: rgba(240,130,35,0.3) transparent;
}
.panel-hint { @apply text-sm text-gray-500 mb-4 leading-relaxed; }

/* ── Teams ── */
.add-team-btn {
  @apply w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-brand-orange text-white
         hover:bg-brand-orange-dark transition-all duration-150 mb-4 cursor-pointer;
}
.teams-list { @apply flex flex-col gap-4; }
.team-card { @apply bg-gray-50 border border-gray-200 rounded-xl p-4; }
.team-card-header { @apply flex items-center gap-2 mb-1; }
.team-toggle {
  @apply flex items-center justify-center w-6 h-6 rounded text-gray-400
         hover:text-brand-orange hover:bg-orange-50 transition-all flex-shrink-0 cursor-pointer;
}
.chevron {
  display: inline-block; font-size: 14px; font-weight: 700; line-height: 1;
  transition: transform 0.2s ease;
}
.chevron.rotated { transform: rotate(90deg); }
.team-summary { @apply text-xs text-gray-400 italic flex-1 min-w-0 truncate; }
.team-body { @apply mt-3; }
.team-name-row { @apply flex items-center gap-2 flex-1; }
.team-name-input {
  @apply flex-1 px-3 py-1.5 text-sm font-semibold border-2 border-gray-300 rounded-lg
         focus:outline-none focus:border-brand-orange transition-all;
}
.color-picker { @apply w-8 h-8 rounded-full cursor-pointer border-2 border-gray-300 p-0.5; }
.remove-team-btn {
  @apply w-7 h-7 flex items-center justify-center rounded-full text-gray-400
         hover:bg-red-100 hover:text-red-600 transition-all duration-150 text-sm font-bold
         cursor-pointer flex-shrink-0;
}
.section-label { @apply text-xs font-bold text-gray-500 uppercase tracking-wide mt-3 mb-2; }
.assigned-chips { @apply flex flex-wrap gap-1.5 min-h-[28px]; }
.assigned-chip {
  @apply flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white;
}
.author-chip { @apply bg-brand-blue; }
.repo-chip   { @apply bg-brand-teal; }
.chip-remove {
  @apply ml-0.5 w-4 h-4 flex items-center justify-center rounded-full
         hover:bg-white/30 text-white cursor-pointer font-bold text-xs leading-none;
}
.empty-hint { @apply text-xs text-gray-400 italic self-center; }
.available-list { @apply mt-2; }
.available-label { @apply text-xs text-gray-400 mb-1; }
.available-pills { @apply flex flex-wrap gap-1; }
.available-pill {
  @apply px-2 py-0.5 rounded-full text-xs font-medium border border-brand-blue text-brand-blue
         bg-white hover:bg-brand-blue hover:text-white transition-all duration-100 cursor-pointer;
}
.available-pill.repo-pill {
  @apply border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white;
}
.available-label--shared { @apply text-amber-600 mt-2; }
.available-pill--shared {
  @apply border-amber-400 text-amber-700 bg-amber-50
         hover:bg-amber-400 hover:text-white hover:border-amber-400;
}
.no-teams { @apply text-center text-gray-500 py-10 space-y-2; }
.hint-text { @apply text-xs text-gray-400; }
.unassigned-section { @apply mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl; }
.unassigned-title { @apply text-sm font-bold text-amber-700 mb-1; }
.unassigned-hint { @apply text-xs text-amber-600/80 italic mb-3 flex items-center gap-1; }
.unassigned-hint::before { content: '✋'; font-style: normal; }
.unassigned-group { @apply mb-2 flex flex-wrap items-center gap-2; }
.unassigned-label { @apply text-xs text-amber-600 font-medium; }
.unassigned-chip { @apply px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-300; }
.unassigned-chip--draggable { @apply cursor-grab select-none; }
.unassigned-chip--draggable:active { @apply cursor-grabbing; }
.unassigned-chip--dragging { @apply opacity-40; }
.team-card { @apply transition-all duration-150; }
.team-card--drop-target {
  @apply ring-2 ring-brand-orange ring-offset-1 bg-orange-50 border-brand-orange;
}
.team-card--drop-target * { pointer-events: none; }

/* ── Team body transition ── */
.team-body-enter-active { transition: max-height 0.25s ease, opacity 0.2s ease; }
.team-body-leave-active { transition: max-height 0.2s ease, opacity 0.15s ease; }
.team-body-enter-from, .team-body-leave-to { max-height: 0; opacity: 0; overflow: hidden; }
.team-body-enter-to, .team-body-leave-from { max-height: 800px; overflow: hidden; }

/* ── Author Aliases ── */
.author-pills-grid { @apply flex flex-wrap gap-2; }
.author-pill {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
         bg-brand-blue text-white cursor-grab select-none transition-all duration-150;
}
.author-pill span { pointer-events: none; }
.author-pill.pill-mapped      { @apply bg-gray-300 text-gray-600; }
.author-pill.pill-dragging    { @apply opacity-40 cursor-grabbing; }
.author-pill.pill-drop-target { @apply ring-2 ring-offset-1 ring-brand-orange scale-105 bg-brand-orange; }
.pill-alias-badge { @apply text-gray-500 font-normal italic text-[10px]; }
.pill-mapped .pill-alias-badge { color: inherit; }

.alias-list { @apply flex flex-col gap-1.5; }
.alias-row  { @apply flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2; }
.alias-raw       { @apply text-xs text-gray-500 font-mono flex-1 truncate; }
.alias-arrow-sm  { @apply text-gray-400 font-bold flex-shrink-0; }
.alias-canonical { @apply text-xs font-semibold text-brand-blue flex-1 truncate; }
.alias-remove {
  @apply w-6 h-6 flex items-center justify-center rounded-full text-gray-400
         hover:bg-red-100 hover:text-red-600 transition-all duration-150 text-xs
         font-bold cursor-pointer flex-shrink-0;
}

/* ── Footer ── */
.panel-footer {
  @apply flex items-center gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0;
}
.footer-btn {
  @apply px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150;
}
.footer-btn--primary {
  @apply bg-brand-orange text-white hover:bg-brand-orange-dark ml-auto;
}
.footer-btn--secondary {
  @apply border border-gray-300 text-gray-600 bg-white hover:border-brand-orange hover:text-brand-orange;
}
.import-error { @apply text-xs text-red-600 flex-1 truncate; }

/* ── Ignored Authors ── */
.section-label--ignored { @apply text-red-600 mt-0; }
.ignored-group {
  @apply p-3 bg-red-50/60 border border-red-200 rounded-xl;
}
.author-pill--active {
  @apply border-0 cursor-pointer hover:bg-red-500 hover:text-white;
}
.author-pill--ignored {
  @apply bg-red-100 text-red-700 border border-red-300 cursor-pointer
         hover:bg-red-200 transition-all;
}
.author-pill--ignored .pill-name { @apply line-through; }
.pill-x { @apply text-red-500 font-bold text-[10px]; }
</style>
