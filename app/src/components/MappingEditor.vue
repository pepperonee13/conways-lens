<template>
  <button class="floating-mapping-btn" @click="panelOpen = true" v-if="!panelOpen" title="Edit team mappings">
    <span>🗺</span>
    <span>Mapping</span>
    <span v-if="teams.length" class="badge">{{ teams.length }}</span>
  </button>

  <transition name="backdrop-fade">
    <div v-if="panelOpen" class="backdrop" @click="panelOpen = false"></div>
  </transition>

  <transition name="slide-panel">
    <div v-if="panelOpen" class="panel">
      <div class="panel-header">
        <h2 class="panel-title">🗺 Team Mapping</h2>
        <div class="header-actions">
          <button class="header-btn" @click="downloadSettings" title="Export settings as JSON">⬇ Export</button>
          <label class="header-btn import-label" title="Import settings from JSON">
            ⬆ Import
            <input type="file" accept=".json" @change="uploadSettings" class="hidden-input" />
          </label>
          <button class="close-btn" @click="panelOpen = false">✕</button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="panel-tabs">
        <button :class="['tab-btn', { active: activeTab === 'teams' }]" @click="activeTab = 'teams'">Teams</button>
        <button :class="['tab-btn', { active: activeTab === 'aliases' }]" @click="activeTab = 'aliases'">
          Author Aliases
          <span v-if="normalizationCount" class="tab-badge">{{ normalizationCount }}</span>
        </button>
      </div>

      <div class="panel-body">
        <!-- ── Teams tab ── -->
        <template v-if="activeTab === 'teams'">
        <p class="panel-hint">
          Assign authors and repositories to teams. Changes take effect immediately and are saved in your browser.
        </p>

        <!-- Add team button -->
        <button class="add-team-btn" @click="addTeam">+ Add Team</button>

        <!-- Team list -->
        <div class="teams-list">
          <div v-for="(team, teamIdx) in teams" :key="team.id" class="team-card">
            <div class="team-card-header">
              <div class="team-name-row">
                <input v-model="team.name" class="team-name-input" :placeholder="'Team ' + (teamIdx + 1)" @input="onTeamChange" />
                <input type="color" v-model="team.color" class="color-picker" @input="onTeamChange" :title="'Team color'" />
              </div>
              <button class="remove-team-btn" @click="removeTeam(team.id)" title="Delete team">✕</button>
            </div>

            <!-- Assigned Authors -->
            <div class="section-label">Authors ({{ (team.authors || []).length }})</div>
            <div class="assigned-chips">
              <span v-for="author in (team.authors || [])" :key="author" class="assigned-chip author-chip">
                {{ author }}
                <button @click="removeAuthorFromTeam(team, author)" class="chip-remove">×</button>
              </span>
              <span v-if="!(team.authors || []).length" class="empty-hint">No authors assigned</span>
            </div>

            <!-- Available Authors (not yet in this team) -->
            <div class="available-list" v-if="availableAuthors(team).length">
              <div class="available-label">Add author:</div>
              <div class="available-pills">
                <button v-for="author in availableAuthors(team)" :key="author" class="available-pill" @click="addAuthorToTeam(team, author)">
                  + {{ author }}
                </button>
              </div>
            </div>

            <!-- Assigned Repos -->
            <div class="section-label">Repositories ({{ (team.products || []).length }})</div>
            <div class="assigned-chips">
              <span v-for="repo in (team.products || [])" :key="repo" class="assigned-chip repo-chip">
                {{ repo }}
                <button @click="removeRepoFromTeam(team, repo)" class="chip-remove">×</button>
              </span>
              <span v-if="!(team.products || []).length" class="empty-hint">No repositories assigned</span>
            </div>

            <!-- Available Repos (not yet in this team) -->
            <div class="available-list" v-if="availableRepos(team).length">
              <div class="available-label">Add repository:</div>
              <div class="available-pills">
                <button v-for="repo in availableRepos(team)" :key="repo" class="available-pill repo-pill" @click="addRepoToTeam(team, repo)">
                  + {{ repo }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!teams.length" class="no-teams">
          <p>No teams defined yet.</p>
          <p>Click <strong>+ Add Team</strong> to create your first team, then assign authors and repositories to it.</p>
          <p class="hint-text">Authors and repositories are discovered automatically from the loaded data.</p>
        </div>

        <!-- Unassigned summary -->
        <div v-if="teams.length && (unassignedAuthors.length || unassignedRepos.length)" class="unassigned-section">
          <div class="unassigned-title">⚠ Unassigned</div>
          <div v-if="unassignedAuthors.length" class="unassigned-group">
            <span class="unassigned-label">Authors not in any team:</span>
            <span v-for="a in unassignedAuthors" :key="a" class="unassigned-chip">{{ a }}</span>
          </div>
          <div v-if="unassignedRepos.length" class="unassigned-group">
            <span class="unassigned-label">Repositories not in any team:</span>
            <span v-for="r in unassignedRepos" :key="r" class="unassigned-chip">{{ r }}</span>
          </div>
        </div>

        <!-- Import error -->
        <div v-if="importError" class="import-error">{{ importError }}</div>
        </template>

        <!-- ── Author Aliases tab ── -->
        <template v-if="activeTab === 'aliases'">
          <p class="panel-hint">
            Drag an author pill onto another to alias it. The pill you drop onto becomes the canonical name. Useful when the same person appears under multiple git identities.
          </p>

          <!-- Pill grid -->
          <div class="author-pills-grid">
            <div
              v-for="author in allRawAuthors"
              :key="author"
              class="author-pill"
              :class="{
                'pill-mapped': isMapped(author),
                'pill-drop-target': dragTarget === author,
                'pill-dragging': dragSource === author,
              }"
              draggable="true"
              @dragstart="onDragStart(author)"
              @dragend="onDragEnd"
              @dragover.prevent="onDragOver(author)"
              @dragleave.self="onDragLeave(author)"
              @drop.prevent="onDrop(author)"
            >
              <span class="pill-name">{{ author }}</span>
              <span v-if="isMapped(author)" class="pill-alias-badge">→ {{ authorNormalizations[author] }}</span>
            </div>
          </div>

          <!-- Active aliases list -->
          <template v-if="normalizationCount">
            <div class="section-label" style="margin-top:1.25rem">Active aliases ({{ normalizationCount }})</div>
            <div class="alias-list">
              <div v-for="(canonical, raw) in authorNormalizations" :key="raw" class="alias-row">
                <span class="alias-raw">{{ raw }}</span>
                <span class="alias-arrow-sm">→</span>
                <span class="alias-canonical">{{ canonical }}</span>
                <button class="alias-remove" @click="removeAuthorNormalization(raw)" title="Remove alias">✕</button>
              </div>
            </div>
          </template>
          <p v-else class="hint-text" style="margin-top:0.75rem;text-align:center">No aliases yet — drag one pill onto another to create one.</p>
        </template>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';

const store = useLensStore();
const { teams, allAuthors, allRawAuthors, allRepos, authorNormalizations } = storeToRefs(store);
const { addTeam, removeTeam, updateTeam, addAuthorNormalization, removeAuthorNormalization } = store;

const panelOpen = ref(false);
const importError = ref('');
const activeTab = ref('teams');

const normalizationCount = computed(() => Object.keys(authorNormalizations.value).length);

function isMapped(author) {
  return author in authorNormalizations.value;
}

// Drag-and-drop state
const dragSource = ref(null);
const dragTarget = ref(null);

function onDragStart(author) {
  dragSource.value = author;
}

function onDragEnd() {
  dragSource.value = null;
  dragTarget.value = null;
}

function onDragOver(author) {
  if (author !== dragSource.value) dragTarget.value = author;
}

function onDragLeave(author) {
  if (dragTarget.value === author) dragTarget.value = null;
}

function onDrop(author) {
  if (dragSource.value && dragSource.value !== author) {
    addAuthorNormalization(dragSource.value, author);
  }
  dragSource.value = null;
  dragTarget.value = null;
}

// Authors that haven't been assigned to this specific team
function availableAuthors(team) {
  const assigned = new Set(team.authors || []);
  return allAuthors.value.filter(a => !assigned.has(a));
}

// Repos not yet assigned to this specific team
function availableRepos(team) {
  const assigned = new Set(team.products || []);
  return allRepos.value.filter(r => !assigned.has(r));
}

const unassignedAuthors = computed(() => {
  const assigned = new Set(teams.value.flatMap(t => t.authors || []));
  return allAuthors.value.filter(a => !assigned.has(a));
});

const unassignedRepos = computed(() => {
  const assigned = new Set(teams.value.flatMap(t => t.products || []));
  return allRepos.value.filter(r => !assigned.has(r));
});

function addAuthorToTeam(team, author) {
  if (!team.authors) team.authors = [];
  if (!team.authors.includes(author)) team.authors.push(author);
  onTeamChange();
}
function removeAuthorFromTeam(team, author) {
  team.authors = (team.authors || []).filter(a => a !== author);
  onTeamChange();
}
function addRepoToTeam(team, repo) {
  if (!team.products) team.products = [];
  if (!team.products.includes(repo)) team.products.push(repo);
  onTeamChange();
}
function removeRepoFromTeam(team, repo) {
  team.products = (team.products || []).filter(r => r !== repo);
  onTeamChange();
}

// Trigger persistence (watch in store handles it, but need to ensure reactivity)
function onTeamChange() {
  // Store watch is deep, mutation suffices
}

function downloadSettings() {
  const json = store.exportSettings();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'conwaylens-settings.json'; a.click();
  URL.revokeObjectURL(url);
}

function uploadSettings(event) {
  importError.value = '';
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      store.importSettings(e.target.result);
    } catch (err) {
      importError.value = err.message;
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
</script>

<style scoped>
.floating-mapping-btn {
  @apply fixed right-6 bottom-6 z-40 bg-gradient-to-r from-brand-orange-dark to-brand-orange text-white rounded-full shadow-2xl px-6 py-4 font-bold text-base cursor-pointer transition-all duration-300 hover:scale-110 flex items-center gap-3;
}
.badge { @apply bg-white text-brand-orange text-xs font-bold px-2.5 py-1 rounded-full ml-1; }
.backdrop { @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40; }
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }
.panel {
  @apply fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 520px; max-width: 95vw;
}
.slide-panel-enter-active, .slide-panel-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(100%); }
.panel-header { @apply bg-gradient-to-r from-brand-orange-dark to-brand-orange text-white px-6 py-5 flex items-center justify-between shadow-lg flex-shrink-0; }
.panel-title { @apply text-2xl font-bold m-0; }
.header-actions { @apply flex items-center gap-2; }
.header-btn { @apply px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/20 text-white hover:bg-white/30 transition-all duration-150 cursor-pointer; }
.import-label { @apply cursor-pointer; }
.hidden-input { @apply hidden; }
.close-btn { @apply text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold transition-all duration-200 cursor-pointer; }
.panel-body { @apply flex-1 overflow-y-auto p-5; scrollbar-width: thin; scrollbar-color: rgba(240,130,35,0.3) transparent; }
.panel-hint { @apply text-sm text-gray-500 mb-4 leading-relaxed; }
.add-team-btn { @apply w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-brand-orange text-white hover:bg-brand-orange-dark transition-all duration-150 mb-4 cursor-pointer; }
.teams-list { @apply flex flex-col gap-4; }
.team-card { @apply bg-gray-50 border border-gray-200 rounded-xl p-4; }
.team-card-header { @apply flex items-start justify-between gap-3 mb-3; }
.team-name-row { @apply flex items-center gap-2 flex-1; }
.team-name-input { @apply flex-1 px-3 py-1.5 text-sm font-semibold border-2 border-gray-300 rounded-lg focus:outline-none focus:border-brand-orange transition-all; }
.color-picker { @apply w-8 h-8 rounded-full cursor-pointer border-2 border-gray-300 p-0.5; }
.remove-team-btn { @apply w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 transition-all duration-150 text-sm font-bold cursor-pointer flex-shrink-0; }
.section-label { @apply text-xs font-bold text-gray-500 uppercase tracking-wide mt-3 mb-2; }
.assigned-chips { @apply flex flex-wrap gap-1.5 min-h-[28px]; }
.assigned-chip { @apply flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white; }
.author-chip { @apply bg-brand-blue; }
.repo-chip { @apply bg-brand-teal; }
.chip-remove { @apply ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/30 text-white cursor-pointer font-bold text-xs leading-none; }
.empty-hint { @apply text-xs text-gray-400 italic self-center; }
.available-list { @apply mt-2; }
.available-label { @apply text-xs text-gray-400 mb-1; }
.available-pills { @apply flex flex-wrap gap-1; }
.available-pill { @apply px-2 py-0.5 rounded-full text-xs font-medium border border-brand-blue text-brand-blue bg-white hover:bg-brand-blue hover:text-white transition-all duration-100 cursor-pointer; }
.available-pill.repo-pill { @apply border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white; }
.no-teams { @apply text-center text-gray-500 py-10 space-y-2; }
.hint-text { @apply text-xs text-gray-400; }
.unassigned-section { @apply mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl; }
.unassigned-title { @apply text-sm font-bold text-amber-700 mb-3; }
.unassigned-group { @apply mb-2 flex flex-wrap items-center gap-2; }
.unassigned-label { @apply text-xs text-amber-600 font-medium; }
.unassigned-chip { @apply px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-300; }
.import-error { @apply mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700; }

/* Tabs */
.panel-tabs { @apply flex border-b border-gray-200 flex-shrink-0 bg-white; }
.tab-btn { @apply flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-brand-orange transition-colors duration-150 relative flex items-center justify-center gap-1.5 cursor-pointer; }
.tab-btn.active { @apply text-brand-orange border-b-2 border-brand-orange -mb-px; }
.tab-badge { @apply bg-brand-orange text-white text-xs font-bold px-2 py-0.5 rounded-full; }

/* Author pill grid */
.author-pills-grid { @apply flex flex-wrap gap-2; }
.author-pill {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
         bg-brand-blue text-white cursor-grab select-none
         transition-all duration-150;
}
.author-pill span { pointer-events: none; }
.author-pill.pill-mapped { @apply bg-gray-300 text-gray-600; }
.author-pill.pill-dragging { @apply opacity-40 cursor-grabbing; }
.author-pill.pill-drop-target {
  @apply ring-2 ring-offset-1 ring-brand-orange scale-105 bg-brand-orange;
}
.pill-alias-badge {
  @apply text-gray-500 font-normal italic text-[10px];
}
.pill-mapped .pill-alias-badge { color: inherit; }

/* Alias list */
.alias-list { @apply flex flex-col gap-1.5; }
.alias-row { @apply flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2; }
.alias-raw { @apply text-xs text-gray-500 font-mono flex-1 truncate; }
.alias-arrow-sm { @apply text-gray-400 font-bold flex-shrink-0; }
.alias-canonical { @apply text-xs font-semibold text-brand-blue flex-1 truncate; }
.alias-remove { @apply w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 transition-all duration-150 text-xs font-bold cursor-pointer flex-shrink-0; }
</style>
