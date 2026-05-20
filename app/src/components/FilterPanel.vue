<template>
  <button class="floating-filter-btn" @click="panelOpen = true" v-if="!panelOpen" :title="'Filters' + (activeFilterCount > 0 ? ' (' + activeFilterCount + ' active)' : '')">
    <span>🔍</span>
    <span>Filters</span>
    <span v-if="activeFilterCount > 0" class="badge">{{ activeFilterCount }}</span>
  </button>

  <transition name="backdrop-fade">
    <div v-if="panelOpen" class="backdrop" @click="panelOpen = false"></div>
  </transition>

  <transition name="slide-panel">
    <div v-if="panelOpen" class="panel">
      <div class="panel-header">
        <h2 class="panel-title">🔍 Filters</h2>
        <button class="close-btn" @click="panelOpen = false">✕</button>
      </div>

      <div class="panel-body">
        <!-- Summary -->
        <div class="summary-card">
          <div class="summary-stat">
            <div class="summary-icon">📊</div>
            <div><div class="summary-value">{{ totalContributions.toLocaleString() }}</div><div class="summary-label">Commits</div></div>
          </div>
          <div class="summary-stat">
            <div class="summary-icon">📦</div>
            <div><div class="summary-value">{{ productCount }}</div><div class="summary-label">Repos</div></div>
          </div>
          <div class="summary-stat">
            <div class="summary-icon">👤</div>
            <div><div class="summary-value">{{ authorCount }}</div><div class="summary-label">Authors</div></div>
          </div>
        </div>

        <!-- Active filter chips -->
        <div v-if="hasActiveFilters" class="active-filters">
          <div class="active-chips">
            <span class="chips-label">Active:</span>
            <button v-for="team in selectedTeams" :key="'t-' + team" class="chip team-chip" @click="toggleTeam(teamsWithColor.find(t => t.name === team))">{{ team }} ×</button>
            <button v-for="repo in selectedRepos.slice(0, 3)" :key="'r-' + repo" class="chip repo-chip" @click="toggleRepo(repo)">{{ repo }} ×</button>
            <span v-if="selectedRepos.length > 3" class="chip-count">+{{ selectedRepos.length - 3 }} more repos</span>
            <button v-for="author in selectedAuthors.slice(0, 3)" :key="'a-' + author" class="chip author-chip" @click="toggleAuthor(author)">{{ author }} ×</button>
            <span v-if="selectedAuthors.length > 3" class="chip-count">+{{ selectedAuthors.length - 3 }} more authors</span>
            <button v-if="hasDateRange" class="chip date-chip" @click="applyDateRange('', '')">📅 {{ dateRangeFilter.from || '…' }} → {{ dateRangeFilter.to || '…' }} ×</button>
          </div>
          <button class="clear-btn" @click="clearFilters">Clear All</button>
        </div>

        <div class="space-y-5">
          <!-- Date Range -->
          <div class="filter-group">
            <span class="filter-label">📅 Date Range</span>
            <div class="date-presets">
              <button class="preset-btn" :class="{ active: !hasDateRange }" @click="setQuickRange('all')">All</button>
              <button class="preset-btn" :class="{ active: activePreset === '30d' }" @click="setQuickRange('30d')">30d</button>
              <button class="preset-btn" :class="{ active: activePreset === '3mo' }" @click="setQuickRange('3mo')">3mo</button>
              <button class="preset-btn" :class="{ active: activePreset === '6mo' }" @click="setQuickRange('6mo')">6mo</button>
              <button class="preset-btn" :class="{ active: activePreset === 'year' }" @click="setQuickRange('year')">This year</button>
            </div>
            <div class="date-inputs">
              <div class="date-input-group"><label class="date-label">From</label><input type="date" v-model="dateFrom" class="date-input" /></div>
              <span class="date-sep">→</span>
              <div class="date-input-group"><label class="date-label">To</label><input type="date" v-model="dateTo" class="date-input" /></div>
            </div>
          </div>

          <!-- Teams -->
          <div class="filter-group" v-if="teamsWithColor.length">
            <span class="filter-label">👥 Teams</span>
            <div class="pills">
              <button v-for="team in teamsWithColor" :key="team.name" :class="['pill', { selected: selectedTeams.includes(team.name) }]"
                @click="toggleTeam(team)" :style="selectedTeams.includes(team.name) ? { background: team.color, color: '#fff', borderColor: team.color } : { borderColor: team.color }">
                {{ team.name }}
              </button>
            </div>
          </div>

          <!-- Repositories -->
          <div class="filter-group">
            <span class="filter-label">📦 Repositories</span>
            <input v-model="repoSearch" type="text" placeholder="Search repositories…" class="search-input" />
            <div class="pills">
              <button v-for="r in filteredRepos" :key="r" :class="['pill', { selected: selectedRepos.includes(r) }]" @click="toggleRepo(r)"
                :style="selectedRepos.includes(r) ? { background: repoTeamColor(r), color: '#fff', borderColor: repoTeamColor(r) } : {}">
                {{ r }}
              </button>
            </div>
            <p v-if="!filteredRepos.length" class="text-sm text-gray-500 mt-2">No repositories match your search</p>
          </div>

          <!-- Authors -->
          <div class="filter-group">
            <span class="filter-label">👤 Authors</span>
            <input v-model="authorSearch" type="text" placeholder="Search authors…" class="search-input" />
            <div class="pills">
              <button v-for="a in filteredAuthors" :key="a" :class="['pill', { selected: selectedAuthors.includes(a) }]" @click="toggleAuthor(a)"
                :style="authorColors[a] ? { background: selectedAuthors.includes(a) ? authorColors[a] : '#f8f9fa', color: selectedAuthors.includes(a) ? '#fff' : '#222', borderColor: authorColors[a] } : {}">
                {{ a }}
              </button>
            </div>
            <p v-if="!filteredAuthors.length" class="text-sm text-gray-500 mt-2">No authors match your search</p>
          </div>

          <!-- Quick: Multi-team repos -->
          <div class="filter-group" v-if="multiTeamProducts.length">
            <span class="filter-label">⚡ Quick Filters</span>
            <button class="quick-card multi-team" @click="applyMultiTeamFilter" :title="'Show repositories with contributors from multiple teams'">
              <span class="qf-icon">👥</span>
              <div><div class="qf-title">Multi-Team Repos</div><div class="qf-count">{{ multiTeamProducts.length }}</div><div class="qf-sub">Cross-team repositories</div></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';

const store = useLensStore();
const { effectiveData, filters, authorColors, totalContributions, productCount, authorCount,
        teams, productTeamMap, teamColors, dateRangeFilter, multiTeamProducts } = storeToRefs(store);
const { setProducts, setAuthors, setDateRange } = store;

const panelOpen = ref(false);

const teamsWithColor = computed(() => (teams.value || []).map(t => ({
  ...t,
  color: teamColors.value?.[t.name] || '#bbb',
})));

const repos = computed(() => [...new Set(effectiveData.value.map(r => r.Product))].filter(Boolean).sort((a, b) => a.localeCompare(b)));
const authors = computed(() => [...new Set(effectiveData.value.map(r => r.Author))].filter(Boolean).sort((a, b) => a.localeCompare(b)));

const repoSearch = ref('');
const authorSearch = ref('');
const filteredRepos = computed(() => repoSearch.value.trim() ? repos.value.filter(r => r.toLowerCase().includes(repoSearch.value.toLowerCase())) : repos.value);
const filteredAuthors = computed(() => authorSearch.value.trim() ? authors.value.filter(a => a.toLowerCase().includes(authorSearch.value.toLowerCase())) : authors.value);

const selectedRepos = ref([...filters.value.products]);
const selectedAuthors = ref([...filters.value.authors]);
const selectedTeams = ref([]);

const dateFrom = ref(dateRangeFilter.value.from || '');
const dateTo = ref(dateRangeFilter.value.to || '');

watch([dateFrom, dateTo], ([from, to]) => setDateRange(from, to));
watch(() => filters.value.products, val => { selectedRepos.value = [...val]; });
watch(() => filters.value.authors, val => { selectedAuthors.value = [...val]; });

const hasDateRange = computed(() => !!(dateRangeFilter.value.from || dateRangeFilter.value.to));

const activePreset = computed(() => {
  if (!hasDateRange.value) return 'all';
  const { from, to } = dateRangeFilter.value;
  const now = new Date(), today = now.toISOString().slice(0, 10);
  if (to !== today) return null;
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
  if (from === d30.toISOString().slice(0, 10)) return '30d';
  const d3m = new Date(now); d3m.setMonth(d3m.getMonth() - 3);
  if (from === d3m.toISOString().slice(0, 10)) return '3mo';
  const d6m = new Date(now); d6m.setMonth(d6m.getMonth() - 6);
  if (from === d6m.toISOString().slice(0, 10)) return '6mo';
  if (from === `${now.getFullYear()}-01-01`) return 'year';
  return null;
});

function applyDateRange(from, to) { dateFrom.value = from; dateTo.value = to; setDateRange(from, to); }
function setQuickRange(preset) {
  const now = new Date(), today = now.toISOString().slice(0, 10);
  if (preset === 'all') { applyDateRange('', ''); return; }
  const d = new Date(now);
  if (preset === '30d') d.setDate(d.getDate() - 30);
  else if (preset === '3mo') d.setMonth(d.getMonth() - 3);
  else if (preset === '6mo') d.setMonth(d.getMonth() - 6);
  else if (preset === 'year') { applyDateRange(`${now.getFullYear()}-01-01`, today); return; }
  applyDateRange(d.toISOString().slice(0, 10), today);
}

const repoTeamColor = (repo) => {
  const team = teamsWithColor.value.find(t => (t.products || []).includes(repo));
  return team ? team.color : '#1f77b4';
};

const hasActiveFilters = computed(() => selectedRepos.value.length > 0 || selectedAuthors.value.length > 0 || selectedTeams.value.length > 0 || hasDateRange.value);
const activeFilterCount = computed(() => [selectedTeams.value.length > 0, selectedRepos.value.length > 0, selectedAuthors.value.length > 0, hasDateRange.value].filter(Boolean).length);

function toggleRepo(r) {
  const idx = selectedRepos.value.indexOf(r);
  if (idx === -1) selectedRepos.value.push(r); else selectedRepos.value.splice(idx, 1);
  setProducts(selectedRepos.value);
}
function toggleAuthor(a) {
  const idx = selectedAuthors.value.indexOf(a);
  if (idx === -1) selectedAuthors.value.push(a); else selectedAuthors.value.splice(idx, 1);
  setAuthors(selectedAuthors.value);
}
function toggleTeam(team) {
  if (!team) return;
  const idx = selectedTeams.value.indexOf(team.name);
  if (idx === -1) {
    selectedTeams.value.push(team.name);
    setAuthors([...new Set([...selectedAuthors.value, ...(team.authors || [])])]);
    setProducts([...new Set([...selectedRepos.value, ...(team.products || [])])]);
  } else {
    selectedTeams.value.splice(idx, 1);
    setAuthors(selectedAuthors.value.filter(a => !(team.authors || []).includes(a)));
    setProducts(selectedRepos.value.filter(r => !(team.products || []).includes(r)));
  }
}
function clearFilters() {
  setProducts([]); setAuthors([]); selectedTeams.value = []; applyDateRange('', '');
  selectedRepos.value = []; selectedAuthors.value = [];
}
function applyMultiTeamFilter() {
  setAuthors([]); selectedTeams.value = [];
  setProducts([...multiTeamProducts.value]);
}

function handleKeyDown(e) { if (e.key === 'Escape' && panelOpen.value) panelOpen.value = false; }
onMounted(() => window.addEventListener('keydown', handleKeyDown));
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));
</script>

<style scoped>
.floating-filter-btn {
  @apply fixed left-6 bottom-6 z-40 bg-gradient-to-r from-brand-blue to-brand-teal text-white rounded-full shadow-2xl px-6 py-4 font-bold text-base cursor-pointer transition-all duration-300 hover:scale-110 flex items-center gap-3;
}
.badge { @apply bg-brand-orange text-white text-xs font-bold px-2.5 py-1 rounded-full ml-1; }
.backdrop { @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40; }
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }
.panel {
  @apply fixed left-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 480px; max-width: 90vw;
}
.slide-panel-enter-active, .slide-panel-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(-100%); }
.panel-header { @apply bg-gradient-to-r from-brand-blue via-brand-blue-light to-brand-teal text-white px-6 py-5 flex items-center justify-between shadow-lg flex-shrink-0; }
.panel-title { @apply text-2xl font-bold m-0; }
.close-btn { @apply text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold transition-all duration-200 cursor-pointer; }
.panel-body { @apply flex-1 overflow-y-auto p-6; scrollbar-width: thin; scrollbar-color: rgba(34, 94, 169, 0.3) transparent; }
.summary-card { @apply bg-gradient-to-r from-brand-blue via-brand-blue-light to-brand-teal rounded-xl p-4 mb-4 grid grid-cols-3 gap-3 shadow-lg; }
.summary-stat { @apply flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg p-3; }
.summary-icon { @apply text-3xl; }
.summary-value { @apply text-2xl font-bold text-white font-mono; }
.summary-label { @apply text-xs text-white/90 font-medium uppercase tracking-wide; }
.active-filters { @apply mt-3 flex items-start gap-3 mb-4; }
.active-chips { @apply flex flex-wrap items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 flex-1; }
.chips-label { @apply text-xs font-semibold text-brand-blue uppercase tracking-wide; }
.chip { @apply px-3 py-1 rounded-full text-xs font-medium border-2 transition-all duration-200 hover:shadow-md cursor-pointer; }
.team-chip { @apply bg-brand-blue text-white border-brand-blue; }
.repo-chip { @apply bg-brand-teal text-white border-brand-teal; }
.author-chip { @apply bg-purple-600 text-white border-purple-600; }
.date-chip { @apply bg-blue-100 text-blue-800 border border-blue-300; }
.chip-count { @apply px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded-full; }
.clear-btn { @apply bg-red-600 text-white font-bold px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-red-700 whitespace-nowrap flex-shrink-0; }
.filter-group { @apply flex flex-col gap-1.5; }
.filter-label { @apply text-sm font-semibold text-gray-700 mb-1; }
.pills { @apply flex flex-wrap gap-2; }
.pill { @apply border-2 border-gray-300 bg-gray-50 rounded-full px-4 py-1.5 text-sm font-medium cursor-pointer transition-all duration-200 hover:border-brand-blue hover:bg-blue-50; }
.pill.selected { @apply border-[3px] shadow-md scale-105; }
.search-input { @apply w-full px-4 py-2.5 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all duration-200 placeholder-gray-400 mb-2; }
.date-presets { @apply flex flex-wrap gap-2 mb-3; }
.preset-btn { @apply px-3 py-1.5 text-xs font-semibold rounded-full border-2 border-gray-300 bg-white text-gray-600 cursor-pointer transition-all duration-150 hover:border-brand-blue hover:text-brand-blue; }
.preset-btn.active { @apply bg-brand-blue text-white border-brand-blue; }
.date-inputs { @apply flex items-center gap-2 flex-wrap; }
.date-input-group { @apply flex flex-col gap-1 flex-1 min-w-[120px]; }
.date-label { @apply text-xs font-medium text-gray-500 uppercase tracking-wide; }
.date-input { @apply w-full px-3 py-2 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all duration-200; }
.date-sep { @apply text-gray-400 font-bold mt-4; }
.quick-card { @apply bg-white border-2 rounded-lg p-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 cursor-pointer flex items-center gap-3 w-full text-left; }
.quick-card.multi-team { @apply border-purple-400 hover:border-purple-500 hover:bg-purple-50; }
.qf-icon { @apply text-2xl flex-shrink-0; }
.qf-title { @apply text-xs font-bold text-gray-700 uppercase tracking-wide; }
.qf-count { @apply text-xl font-bold text-brand-blue font-mono; }
.qf-sub { @apply text-xs text-gray-500; }
</style>
