<template>
  <!-- Toggle button -->
  <button class="mapping-toggle" @click="open = !open">
    {{ open ? '✕ Close' : '⚙ Mapping' }}
  </button>

  <!-- Backdrop -->
  <transition name="backdrop">
    <div v-if="open" class="panel-backdrop" @click="open = false"></div>
  </transition>

  <!-- Panel -->
  <transition name="panel">
    <div v-if="open" class="mapping-panel">
      <div class="panel-header">
        <h2 class="panel-title">Mapping Editor</h2>
        <button class="panel-close" @click="open = false">✕</button>
      </div>

      <!-- Tabs -->
      <div class="tab-bar">
        <button v-for="t in TABS" :key="t.id" :class="['tab-btn', { active: tab === t.id }]" @click="tab = t.id">
          {{ t.label }}
        </button>
      </div>

      <div class="panel-body">

        <!-- ── Author Aliases ── -->
        <template v-if="tab === 'aliases'">
          <p class="tab-desc">Map raw git author names to canonical display names. The canonical name is used throughout the graph.</p>

          <div class="add-row">
            <select v-model="aliasRaw" class="form-select">
              <option value="">— select raw author —</option>
              <option v-for="a in unmappedRawAuthors" :key="a" :value="a">{{ a }}</option>
            </select>
            <span class="arrow">→</span>
            <input v-model="aliasCanonical" class="form-input" placeholder="canonical name" @keyup.enter="submitAlias" />
            <button class="btn-add" :disabled="!aliasRaw || !aliasCanonical.trim()" @click="submitAlias">Add</button>
          </div>

          <div class="mapping-list">
            <div v-for="[raw, canonical] in sortedNormalizations" :key="raw" class="mapping-row">
              <span class="raw-name" :title="raw">{{ raw }}</span>
              <span class="arrow">→</span>
              <span class="canonical-name">{{ canonical }}</span>
              <button class="btn-remove" @click="store.removeNormalization(raw)" title="Remove">✕</button>
            </div>
            <p v-if="!sortedNormalizations.length" class="empty-hint">No aliases yet.</p>
          </div>
        </template>

        <!-- ── Teams ── -->
        <template v-if="tab === 'teams'">
          <p class="tab-desc">Team color is applied to all assigned author and repository nodes in the graph.</p>

          <button class="btn-add-team" @click="store.addTeam()">+ Add Team</button>

          <div class="teams-list">
            <div v-for="team in teams" :key="team.id" class="team-card">
              <div class="team-header-row">
                <input type="color" v-model="team.color" class="color-picker" :title="team.color" />
                <input v-model="team.name" class="team-name-input" placeholder="Team name" />
                <button class="btn-remove" @click="store.removeTeam(team.id)" title="Delete team">✕</button>
              </div>

              <div class="team-section">
                <span class="section-label">Authors</span>
                <div class="chips">
                  <span v-for="a in team.authors" :key="a" class="chip" :style="{ borderColor: team.color }">
                    {{ a }}<button class="chip-remove" @click="removeFromTeam(team, 'authors', a)">✕</button>
                  </span>
                  <span v-if="!team.authors.length" class="empty-hint-inline">none assigned</span>
                </div>
                <select class="add-select" @change="e => addToTeam(team, 'authors', e)">
                  <option value="">+ add author</option>
                  <option v-for="a in availableAuthors(team)" :key="a" :value="a">{{ a }}</option>
                </select>
              </div>

              <div class="team-section">
                <span class="section-label">Repositories</span>
                <div class="chips">
                  <span v-for="r in team.repos" :key="r" class="chip" :style="{ borderColor: team.color }">
                    {{ r }}<button class="chip-remove" @click="removeFromTeam(team, 'repos', r)">✕</button>
                  </span>
                  <span v-if="!team.repos.length" class="empty-hint-inline">none assigned</span>
                </div>
                <select class="add-select" @change="e => addToTeam(team, 'repos', e)">
                  <option value="">+ add repository</option>
                  <option v-for="r in availableRepos(team)" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>
            </div>

            <p v-if="!teams.length" class="empty-hint">No teams yet. Click "+ Add Team" to start.</p>
          </div>
        </template>

        <!-- ── Ignored Authors ── -->
        <template v-if="tab === 'ignored'">
          <p class="tab-desc">Ignored authors are removed from the graph entirely. Uses canonical names (after alias mappings).</p>

          <div class="author-list">
            <div v-for="a in allAuthors" :key="a" :class="['author-row', { ignored: isIgnored(a) }]">
              <span class="author-name">{{ a }}</span>
              <button
                :class="['btn-toggle', { active: isIgnored(a) }]"
                @click="isIgnored(a) ? store.unignoreAuthor(a) : store.ignoreAuthor(a)"
              >
                {{ isIgnored(a) ? 'Unignore' : 'Ignore' }}
              </button>
            </div>
            <p v-if="!allAuthors.length" class="empty-hint">No authors found. Upload a CSV first.</p>
          </div>
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
const { teams, authorNormalizations, ignoredAuthors, allRawAuthors, allAuthors, allRepos } = storeToRefs(store);

const open = ref(false);
const tab  = ref('aliases');

const TABS = [
  { id: 'aliases', label: 'Author Aliases' },
  { id: 'teams',   label: 'Teams' },
  { id: 'ignored', label: 'Ignored Authors' },
];

// ── Author Aliases ──
const aliasRaw       = ref('');
const aliasCanonical = ref('');

const unmappedRawAuthors = computed(() =>
  allRawAuthors.value.filter(a => !authorNormalizations.value[a])
);

const sortedNormalizations = computed(() =>
  Object.entries(authorNormalizations.value).sort(([a], [b]) => a.localeCompare(b))
);

function submitAlias() {
  const raw = aliasRaw.value, canonical = aliasCanonical.value.trim();
  if (!raw || !canonical) return;
  store.setNormalization(raw, canonical);
  aliasRaw.value = '';
  aliasCanonical.value = '';
}

// ── Teams ──
function availableAuthors(team) {
  return allAuthors.value.filter(a => !team.authors.includes(a));
}

function availableRepos(team) {
  return allRepos.value.filter(r => !team.repos.includes(r));
}

function addToTeam(team, field, e) {
  const val = e.target.value;
  e.target.value = '';
  if (!val || team[field].includes(val)) return;
  team[field].push(val);
}

function removeFromTeam(team, field, item) {
  team[field] = team[field].filter(v => v !== item);
}

// ── Ignored Authors ──
function isIgnored(name) {
  return ignoredAuthors.value.includes(name);
}
</script>

<style scoped>
.mapping-toggle {
  @apply fixed bottom-5 right-5 z-40 px-4 py-2 rounded-xl text-sm font-semibold
         bg-brand-blue text-white shadow-lg hover:bg-brand-blue-dark
         transition-all duration-150 border-2 border-white/20;
}

.panel-backdrop {
  @apply fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px];
}

.mapping-panel {
  @apply fixed top-0 right-0 bottom-0 z-50 bg-white shadow-2xl
         flex flex-col border-l border-gray-200;
  width: 420px;
}

.panel-header {
  @apply flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0;
}
.panel-title { @apply text-lg font-bold text-brand-gray; }
.panel-close { @apply text-gray-400 hover:text-gray-700 text-lg leading-none transition-colors; }

.tab-bar {
  @apply flex border-b border-gray-100 flex-shrink-0;
}
.tab-btn {
  @apply flex-1 py-2.5 text-xs font-semibold text-gray-500 hover:text-brand-blue transition-colors
         border-b-2 border-transparent -mb-px;
}
.tab-btn.active { @apply text-brand-blue border-brand-blue; }

.panel-body {
  @apply flex-1 overflow-y-auto px-5 py-4;
  scrollbar-width: thin; scrollbar-color: #e2e8f0 transparent;
}

.tab-desc { @apply text-xs text-gray-400 mb-4 leading-relaxed; }

/* ── Aliases ── */
.add-row {
  @apply flex items-center gap-2 mb-4;
}
.form-select, .form-input {
  @apply flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2
         focus:outline-none focus:border-brand-blue bg-gray-50;
  min-width: 0;
}
.arrow { @apply text-gray-400 text-sm flex-shrink-0; }
.btn-add {
  @apply px-3 py-2 rounded-lg text-xs font-semibold bg-brand-blue text-white
         hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed
         transition-colors flex-shrink-0;
}
.mapping-list { @apply space-y-1.5; }
.mapping-row {
  @apply flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2;
}
.raw-name { @apply text-gray-500 font-mono truncate flex-1 min-w-0; }
.canonical-name { @apply text-brand-gray font-semibold flex-1 min-w-0; }
.btn-remove {
  @apply text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 text-xs leading-none;
}

/* ── Teams ── */
.btn-add-team {
  @apply mb-4 px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-300
         text-gray-600 hover:border-brand-blue hover:text-brand-blue transition-all;
}
.teams-list { @apply space-y-4; }
.team-card {
  @apply border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50/50;
}
.team-header-row { @apply flex items-center gap-2; }
.color-picker {
  @apply w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0;
  background: none;
}
.team-name-input {
  @apply flex-1 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-1.5
         focus:outline-none focus:border-brand-blue bg-white;
}
.team-section { @apply space-y-1.5; }
.section-label { @apply text-xs font-bold text-gray-400 uppercase tracking-wide; }
.chips { @apply flex flex-wrap gap-1.5 min-h-[24px]; }
.chip {
  @apply flex items-center gap-1 text-xs bg-white border rounded-full px-2.5 py-1
         font-medium text-brand-gray;
  border-width: 1.5px;
}
.chip-remove { @apply text-gray-400 hover:text-red-500 leading-none transition-colors; }
.empty-hint-inline { @apply text-xs text-gray-300 italic self-center; }
.add-select {
  @apply w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5
         focus:outline-none focus:border-brand-blue bg-white text-gray-500 cursor-pointer;
}

/* ── Ignored Authors ── */
.author-list { @apply space-y-1; }
.author-row {
  @apply flex items-center justify-between gap-3 px-3 py-2 rounded-lg
         transition-colors hover:bg-gray-50;
}
.author-row.ignored { @apply bg-red-50/60; }
.author-name { @apply text-sm text-brand-gray flex-1 min-w-0 truncate; }
.author-row.ignored .author-name { @apply text-gray-400 line-through; }
.btn-toggle {
  @apply px-3 py-1 rounded-lg text-xs font-semibold flex-shrink-0
         border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600
         transition-all;
}
.btn-toggle.active {
  @apply border-green-300 text-green-700 hover:border-gray-200 hover:text-gray-500;
}

/* ── Shared ── */
.empty-hint { @apply text-xs text-gray-400 italic py-2; }

/* ── Transitions ── */
.backdrop-enter-active, .backdrop-leave-active { transition: opacity 0.2s ease; }
.backdrop-enter-from, .backdrop-leave-to { opacity: 0; }

.panel-enter-active, .panel-leave-active { transition: transform 0.25s ease; }
.panel-enter-from, .panel-leave-to { transform: translateX(100%); }
</style>
