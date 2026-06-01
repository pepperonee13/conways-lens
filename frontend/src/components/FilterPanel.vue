<template>
  <FabButton v-if="!open" class="fixed left-6 bottom-6 z-40"
    label="Filters" :badge="activeFilterCount || null" color="teal" expand="right"
    title="Filters" @click="open = true"
  >
    <SlidersHorizontal :size="18" />
  </FabButton>

  <transition name="backdrop-fade">
    <div v-if="open" class="backdrop" @click="open = false"></div>
  </transition>

  <transition name="slide-panel">
    <div v-if="open" class="panel">

      <!-- Header -->
      <div class="panel-header">
        <h2 class="panel-title">
          <SlidersHorizontal :size="20" class="title-icon" /> Filters
        </h2>
        <div class="header-right">
          <button v-if="activeFilterCount" class="clear-all-btn" @click="store.clearAllFilters()">
            Clear all
          </button>
          <button class="close-btn" @click="open = false" title="Close">
            <X :size="18" />
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="search-wrap">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="Search teams, repos, authors…"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''" title="Clear">
          <X :size="12" />
        </button>
      </div>

      <!-- Body -->
      <div class="panel-body">

        <p v-if="!filterableTeams.length" class="empty-state">
          No teams configured. Set up teams in the <strong>Mapping</strong> panel first.
        </p>

        <p v-else-if="filteredTeams.length === 0" class="empty-state">
          No results for "<em>{{ searchQuery }}</em>"
        </p>

        <template v-else>
          <div
            v-for="tv in filteredTeams"
            :key="tv.id"
            class="team-card"
            :class="{
              'is-team-selected': filterTeamIds.has(tv.id),
              'has-partial':      !filterTeamIds.has(tv.id) && (tv.selContexts > 0 || tv.selAuthors > 0),
            }"
            :style="{ '--card-color': tv.color }"
          >
            <!-- Card header -->
            <div class="card-header" @click="toggleExpand(tv.id)">
              <ChevronRight :size="14" :class="['chevron', { rotated: isExpanded(tv.id) }]" />
              <span class="team-dot" :style="{ backgroundColor: tv.color }"></span>
              <span class="card-name">{{ tv.name }}</span>

              <!-- selection summary chips -->
              <span class="card-chips">
                <span v-if="filterTeamIds.has(tv.id)" class="chip chip--team">all contexts</span>
                <template v-else>
                  <span v-if="tv.selContexts" class="chip chip--repo">{{ tv.selContexts }} context{{ tv.selContexts !== 1 ? 's' : '' }}</span>
                  <span v-if="tv.selAuthors"  class="chip chip--author">{{ tv.selAuthors }} author{{ tv.selAuthors !== 1 ? 's' : '' }}</span>
                </template>
              </span>

              <!-- "Select team" quick-toggle -->
              <button
                :class="['select-btn', { active: filterTeamIds.has(tv.id) }]"
                @click.stop="store.setFilterTeam(tv.id, !filterTeamIds.has(tv.id))"
                :title="filterTeamIds.has(tv.id) ? 'Deselect whole team' : 'Select whole team'"
              >
                <Check v-if="filterTeamIds.has(tv.id)" :size="11" />
                <span>{{ filterTeamIds.has(tv.id) ? 'Team ✓' : 'All' }}</span>
              </button>
            </div>

            <!-- Expanded body -->
            <transition name="card-body">
              <div v-if="isExpanded(tv.id)" class="card-body-wrap">

                <!-- Repos -->
                <div class="sub-section">
                  <div class="sub-header">
                    <span class="sub-label">Bounded Contexts</span>
                    <span class="sub-count">{{ tv.contexts.length }}</span>
                  </div>
                  <div v-if="tv.contexts.length" class="item-grid">
                    <label
                      v-for="repo in tv.contexts"
                      :key="repo"
                      :class="['item-row', {
                        'item-checked':  filterContextIds.has(repo) || filterTeamIds.has(tv.id),
                        'item-via-team': filterTeamIds.has(tv.id) && !filterContextIds.has(repo),
                      }]"
                      @click.stop
                    >
                      <input
                        type="checkbox"
                        class="item-cb"
                        :checked="filterContextIds.has(repo) || filterTeamIds.has(tv.id)"
                        @change="onContextToggle(repo, tv, $event.target.checked)"
                      />
                      <span class="item-name" :title="contextNameMap[repo] ?? repo">{{ contextNameMap[repo] ?? repo }}</span>
                    </label>
                  </div>
                  <p v-else class="sub-empty">No bounded contexts assigned</p>
                </div>

                <!-- Authors -->
                <div class="sub-section">
                  <div class="sub-header">
                    <span class="sub-label">Authors</span>
                    <span class="sub-count">{{ tv.authors.length }}</span>
                  </div>
                  <div v-if="tv.authors.length" class="item-grid">
                    <label
                      v-for="author in tv.authors"
                      :key="author"
                      :class="['item-row', { 'item-checked': filterAuthorIds.has(author) }]"
                      @click.stop
                    >
                      <input
                        type="checkbox"
                        class="item-cb"
                        :checked="filterAuthorIds.has(author)"
                        @change="store.setFilterAuthor(author, $event.target.checked)"
                      />
                      <span class="item-name" :title="anonMap[author]">{{ anonMap[author] }}</span>
                    </label>
                  </div>
                  <p v-else class="sub-empty">No authors assigned</p>
                </div>

              </div>
            </transition>
          </div>
        </template>

        <!-- Active note -->
        <div v-if="activeFilterCount" class="active-note">
          <Info :size="13" />
          <span>
            {{ activeFilterCount }} active filter{{ activeFilterCount !== 1 ? 's' : '' }}
            — violation threshold still applies
          </span>
        </div>

      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';
import { SlidersHorizontal, X, Check, Search, ChevronRight, Info } from '@lucide/vue';
import FabButton from './FabButton.vue';
import { useAnonymize } from '../composables/useAnonymize.js';

const store = useLensStore();
const { teams, syntheticTeam, filterTeamIds, filterContextIds, filterAuthorIds, allContexts } = storeToRefs(store);

// context id → display name lookup
const contextNameMap = computed(() => {
  const map = {};
  for (const c of allContexts.value) map[c.id] = c.name;
  return map;
});
const { anonymize } = useAnonymize();

// Compute display names once so filter, sort, and template all reuse the same map.
const anonMap = computed(() => {
  const map = {};
  for (const team of filterableTeams.value) {
    for (const a of team.authors) map[a] = anonymize(a);
  }
  return map;
});

const open        = ref(false);
const searchQuery = ref('');

// All teams shown in the panel (real + Outside Contributors)
const filterableTeams = computed(() => {
  const result = [...teams.value];
  if (syntheticTeam.value) result.push(syntheticTeam.value);
  return result;
});

// Search-filtered + selection-count augmented team views
const filteredTeams = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();

  return filterableTeams.value.flatMap(team => {
    const teamHit = !q || team.name.toLowerCase().includes(q);
    const contexts = (teamHit ? [...team.contexts] : team.contexts.filter(r => (contextNameMap.value[r] ?? r).toLowerCase().includes(q))).sort();
    const authors = (teamHit ? [...team.authors] : team.authors.filter(a => anonMap.value[a]?.toLowerCase().includes(q)))
      .sort((a, b) => (anonMap.value[a] ?? a).localeCompare(anonMap.value[b] ?? b));

    if (q && !teamHit && contexts.length === 0 && authors.length === 0) return [];

    return [{
      ...team,
      contexts,
      authors,
      selContexts: contexts.filter(r => filterContextIds.value.has(r)).length,
      selAuthors:  authors.filter(a => filterAuthorIds.value.has(a)).length,
      autoExpand:  q && !teamHit,
    }];
  });
});

const activeFilterCount = computed(
  () => filterTeamIds.value.size + filterContextIds.value.size + filterAuthorIds.value.size
);

// Expansion state
// expandedTeams: manually opened; collapsedOverrides: explicitly closed while auto-expanded.
const expandedTeams      = ref(new Set());
const collapsedOverrides = ref(new Set());

// Reset overrides on each new search so auto-expansions start fresh.
watch(searchQuery, () => { collapsedOverrides.value = new Set(); });

function isExpanded(id) {
  if (collapsedOverrides.value.has(id)) return false;
  if (expandedTeams.value.has(id)) return true;
  return filteredTeams.value.find(t => t.id === id)?.autoExpand ?? false;
}
function toggleExpand(id) {
  const expanded  = new Set(expandedTeams.value);
  const collapsed = new Set(collapsedOverrides.value);
  if (isExpanded(id)) {
    expanded.delete(id);
    if (filteredTeams.value.find(t => t.id === id)?.autoExpand) collapsed.add(id);
  } else {
    expanded.add(id);
    collapsed.delete(id);
  }
  expandedTeams.value      = expanded;
  collapsedOverrides.value = collapsed;
}

// When a repo checkbox is toggled while its team is fully selected,
// "explode" the team selection into individual repo picks minus this one.
// Use the full (unfiltered) team repo list so a search-narrowed view
// doesn't silently drop repos that aren't currently visible.
function onContextToggle(contextId, tv, checked) {
  if (!checked && filterTeamIds.value.has(tv.id)) {
    const fullTeam = filterableTeams.value.find(t => t.id === tv.id);
    store.setFilterTeam(tv.id, false);
    for (const r of (fullTeam?.contexts ?? tv.contexts)) {
      if (r !== contextId) store.setFilterContext(r, true);
    }
  } else {
    store.setFilterContext(contextId, checked);
  }
}
</script>

<style scoped>

.backdrop {
  @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40;
}
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }

.panel {
  @apply fixed left-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 460px; max-width: 95vw;
}
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(-100%); }

/* Header */
.panel-header {
  @apply px-5 py-4 flex items-center justify-between shadow-sm flex-shrink-0 text-white;
  background: linear-gradient(to right, #067a85, #088F9B);
}
.panel-title   { @apply flex items-center gap-2 text-xl font-bold m-0; }
.title-icon    { @apply opacity-80; }
.header-right  { @apply flex items-center gap-2; }
.clear-all-btn {
  @apply text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all;
  background: rgba(255,255,255,0.18);
  color: white;
}
.clear-all-btn:hover { background: rgba(255,255,255,0.3); }
.close-btn {
  @apply w-9 h-9 flex items-center justify-center rounded-full cursor-pointer transition-all;
  color: white;
}
.close-btn:hover { background: rgba(255,255,255,0.2); }

/* Search */
.search-wrap {
  @apply flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0;
}
.search-icon  { @apply text-gray-400 flex-shrink-0; }
.search-input {
  @apply flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400;
}
.search-clear {
  @apply w-5 h-5 flex items-center justify-center rounded-full text-gray-400
         hover:bg-gray-200 hover:text-gray-600 transition-all cursor-pointer flex-shrink-0;
}

/* Body */
.panel-body {
  @apply flex-1 overflow-y-auto p-3;
  scrollbar-width: thin;
  scrollbar-color: rgba(8,143,155,0.25) transparent;
}
.empty-state {
  @apply text-sm text-gray-400 text-center py-10 leading-relaxed;
}

/* Team cards */
.team-card {
  @apply mb-2 rounded-xl border-2 border-gray-100 overflow-hidden transition-all duration-150;
  border-left: 3px solid var(--card-color, #e5e7eb);
}
.team-card.is-team-selected {
  border-color: var(--card-color);
  background: rgba(8,143,155,0.03);
}
.team-card.has-partial {
  border-color: var(--card-color);
  border-style: solid;
}

.card-header {
  @apply flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none
         hover:bg-gray-50 transition-colors duration-100;
}
.chevron {
  @apply flex-shrink-0 text-gray-400 transition-transform duration-200;
}
.chevron.rotated { transform: rotate(90deg); }
.team-dot {
  @apply w-2.5 h-2.5 rounded-full flex-shrink-0;
}
.card-name {
  @apply text-sm font-semibold text-gray-700 flex-1 min-w-0 truncate;
}

/* Selection summary chips in header */
.card-chips { @apply flex items-center gap-1 flex-shrink-0; }
.chip {
  @apply text-[10px] font-semibold px-1.5 py-0.5 rounded-full;
}
.chip--team   { @apply bg-teal-100 text-teal-700; }
.chip--repo   { @apply bg-blue-100 text-blue-700; }
.chip--author { @apply bg-purple-100 text-purple-700; }

/* "Select all" quick-toggle */
.select-btn {
  @apply flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border
         cursor-pointer transition-all duration-150 flex-shrink-0;
  border-color: var(--card-color);
  color: var(--card-color);
  background: white;
}
.select-btn:hover { filter: brightness(0.92); background: color-mix(in srgb, var(--card-color) 8%, white); }
.select-btn.active {
  color: white;
  background: var(--card-color);
  border-color: var(--card-color);
}

/* Expanded body */
.card-body-enter-active { transition: max-height 0.22s ease, opacity 0.18s ease; }
.card-body-leave-active { transition: max-height 0.18s ease, opacity 0.14s ease; }
.card-body-enter-from, .card-body-leave-to { max-height: 0; opacity: 0; overflow: hidden; }
.card-body-enter-to, .card-body-leave-from { max-height: 1000px; overflow: hidden; }

.card-body-wrap {
  @apply border-t border-gray-100 bg-gray-50/60 px-3 pb-3 pt-2;
}

/* Sub-sections */
.sub-section { @apply mb-3; }
.sub-section:last-child { @apply mb-0; }
.sub-header {
  @apply flex items-center gap-1.5 mb-1.5;
}
.sub-label { @apply text-[10px] font-bold text-gray-400 uppercase tracking-wider; }
.sub-count { @apply text-[10px] text-gray-400 font-mono; }
.sub-empty { @apply text-xs text-gray-400 italic; }

/* Item grid */
.item-grid {
  @apply flex flex-col gap-0.5;
}
.item-row {
  @apply flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer
         text-xs text-gray-600 transition-colors duration-100
         hover:bg-white hover:shadow-sm;
}
.item-row.item-checked {
  @apply bg-white text-gray-800;
}
.item-row.item-via-team {
  @apply opacity-70;
}
.item-cb {
  @apply w-3.5 h-3.5 rounded flex-shrink-0 cursor-pointer;
  accent-color: #088F9B;
}
.item-name {
  @apply flex-1 min-w-0 truncate;
}

/* Active note */
.active-note {
  @apply mt-3 flex items-center gap-2 text-xs text-brand-teal bg-teal-50
         border border-teal-200 rounded-lg px-3 py-2.5;
}
</style>
