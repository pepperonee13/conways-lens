<template>
  <button class="floating-filter-btn" v-if="!open" @click="open = true" title="Filters">
    <SlidersHorizontal :size="18" />
    <span>Filters</span>
    <span v-if="filterTeamIds.size" class="filter-badge">{{ filterTeamIds.size }}</span>
  </button>

  <transition name="backdrop-fade">
    <div v-if="open" class="backdrop" @click="open = false"></div>
  </transition>

  <transition name="slide-panel">
    <div v-if="open" class="panel">
      <div class="panel-header">
        <h2 class="panel-title">
          <SlidersHorizontal :size="20" class="title-icon" /> Filters
        </h2>
        <button class="close-btn" @click="open = false" title="Close"><X :size="18" /></button>
      </div>

      <div class="panel-body">

        <!-- Team filter section -->
        <div class="section-header">
          <span class="section-title">Selected Teams</span>
          <div class="section-actions">
            <button
              v-if="filterTeamIds.size < teams.length"
              class="action-link"
              @click="selectAll"
            >Select all</button>
            <span v-if="filterTeamIds.size > 0 && filterTeamIds.size < teams.length" class="action-sep">·</span>
            <button
              v-if="filterTeamIds.size > 0"
              class="action-link action-link--clear"
              @click="store.clearFilterTeams()"
            >Clear</button>
          </div>
        </div>

        <p class="panel-hint">
          Show only repos where at least one author from a selected team has contributed.
          Leave all unselected to show every repo.
        </p>

        <div v-if="!teams.length" class="no-teams">
          No teams configured yet. Set up teams in the <strong>Mapping</strong> panel first.
        </div>

        <div class="team-filter-list">
          <label
            v-for="team in teams"
            :key="team.id"
            :class="['team-filter-item', { active: filterTeamIds.has(team.id) }]"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="filterTeamIds.has(team.id)"
              @change="store.setFilterTeam(team.id, $event.target.checked)"
            />
            <span class="team-swatch" :style="{ backgroundColor: team.color }"></span>
            <span class="team-filter-name">{{ team.name }}</span>
            <span class="team-filter-meta">{{ team.authors.length }} authors · {{ team.repos.length }} repos</span>
            <span :class="['team-check', { visible: filterTeamIds.has(team.id) }]">
              <Check :size="14" />
            </span>
          </label>
        </div>

        <div v-if="filterTeamIds.size > 0" class="filter-active-note">
          <Info :size="13" />
          Showing repos with contributions from
          <strong>{{ filterTeamIds.size }} team{{ filterTeamIds.size === 1 ? '' : 's' }}</strong>.
          Violation threshold applies on top.
        </div>

      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';
import { SlidersHorizontal, X, Check, Info } from 'lucide-vue-next';

const store = useLensStore();
const { teams, filterTeamIds } = storeToRefs(store);

const open = ref(false);

function selectAll() {
  for (const team of teams.value) {
    store.setFilterTeam(team.id, true);
  }
}
</script>

<style scoped>
.floating-filter-btn {
  @apply fixed left-6 bottom-6 z-40
         text-white rounded-full shadow-2xl px-6 py-4 font-bold text-base cursor-pointer
         transition-all duration-300 hover:scale-110 flex items-center gap-3;
  background: linear-gradient(to right, #067a85, #088F9B);
}
.filter-badge {
  @apply bg-white text-brand-teal text-xs font-bold px-2.5 py-1 rounded-full ml-1;
}

.backdrop {
  @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40;
}
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }

.panel {
  @apply fixed left-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 420px; max-width: 95vw;
}
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(-100%); }

.panel-header {
  @apply px-6 py-5 flex items-center justify-between shadow-lg flex-shrink-0 text-white;
  background: linear-gradient(to right, #067a85, #088F9B);
}
.panel-title { @apply flex items-center gap-2 text-2xl font-bold m-0; }
.title-icon  { @apply text-white/80; }
.close-btn {
  @apply text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center
         justify-center transition-all duration-200 cursor-pointer;
}

.panel-body {
  @apply flex-1 overflow-y-auto p-5;
  scrollbar-width: thin; scrollbar-color: rgba(8,143,155,0.3) transparent;
}

.panel-hint { @apply text-sm text-gray-500 mb-4 leading-relaxed; }

/* Section header */
.section-header {
  @apply flex items-center justify-between mb-2;
}
.section-title {
  @apply text-xs font-bold text-gray-500 uppercase tracking-wide;
}
.section-actions {
  @apply flex items-center gap-1.5;
}
.action-link {
  @apply text-xs font-semibold cursor-pointer transition-colors duration-150;
  color: #088F9B;
}
.action-link:hover { color: #067a85; }
.action-link--clear { @apply text-red-400 hover:text-red-600; }
.action-sep { @apply text-gray-300 text-xs; }

/* No teams */
.no-teams {
  @apply text-sm text-gray-400 py-6 text-center leading-relaxed;
}

/* Team list */
.team-filter-list {
  @apply flex flex-col gap-2;
}

.team-filter-item {
  @apply flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-gray-100
         cursor-pointer transition-all duration-150 select-none;
  background: #f9fafb;
}
.team-filter-item:hover {
  @apply border-gray-300 bg-white;
}
.team-filter-item.active {
  @apply border-brand-teal bg-teal-50/60;
}

.team-swatch {
  @apply w-3 h-3 rounded-full flex-shrink-0;
}
.team-filter-name {
  @apply text-sm font-semibold text-gray-700 flex-1 min-w-0 truncate;
}
.team-filter-meta {
  @apply text-xs text-gray-400 flex-shrink-0;
}
.team-check {
  @apply w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
         transition-all duration-150 opacity-0;
  color: #088F9B;
}
.team-check.visible {
  @apply opacity-100;
}

/* Active filter note */
.filter-active-note {
  @apply mt-5 flex items-start gap-2 text-xs text-brand-teal bg-teal-50 border border-teal-200
         rounded-lg px-3 py-2.5 leading-relaxed;
}
</style>
