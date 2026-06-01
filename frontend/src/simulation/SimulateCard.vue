<template>
  <!-- Simulate card -->
  <div class="simulate-card">
    <div class="sim-header">
      <FlaskConical :size="36" class="sim-icon" :stroke-width="1.5" />
      <div>
        <h2 class="sim-title">Simulate a scenario</h2>
        <p class="sim-subtitle">Generate random contribution data on the fly</p>
      </div>
    </div>

    <div class="sim-controls">
      <div class="sim-row">
        <label class="sim-label">Authors</label>
        <span class="sim-value">{{ simAuthors }}</span>
      </div>
      <input type="range" class="sim-slider" min="3" max="26" v-model.number="simAuthors" />

      <div class="sim-row">
        <label class="sim-label">Repositories</label>
        <span class="sim-value">{{ simRepos }}</span>
      </div>
      <input type="range" class="sim-slider" min="2" max="20" v-model.number="simRepos" />

      <div class="sim-row">
        <label class="sim-label">Commits per active pair</label>
        <span class="sim-value">{{ simMin }} – {{ simMax }}</span>
      </div>
      <div class="sim-range-row">
        <input type="range" class="sim-slider" min="1" max="200"
               :value="simMin" @input="e => simMin = Math.min(+e.target.value, simMax)" />
        <input type="range" class="sim-slider" min="1" max="500"
               :value="simMax" @input="e => simMax = Math.max(+e.target.value, simMin)" />
      </div>
    </div>

    <button class="sim-btn" @click.stop="generate">Generate</button>
  </div>

  <!-- Overwrite confirmation dialog -->
  <teleport to="body">
    <div v-if="showSimConfirm" class="sim-confirm-backdrop" @click.self="cancelSim">
      <div class="sim-confirm-dialog" role="dialog" aria-modal="true">
        <h3 class="sim-confirm-title">Replace team mappings?</h3>
        <p class="sim-confirm-body">
          Generating a simulation will overwrite your current team configuration with
          auto-generated teams. This cannot be undone.
        </p>
        <p class="sim-confirm-hint">
          Export your mappings first so you can restore them later.
        </p>
        <div class="sim-confirm-actions">
          <button class="sim-export-btn" @click="exportMappings">
            <Download :size="14" /> Export mappings
          </button>
          <div class="sim-confirm-right">
            <button class="sim-cancel-btn" @click="cancelSim">Cancel</button>
            <button class="sim-proceed-btn" @click="confirmSim">Generate anyway</button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref } from 'vue';
import { FlaskConical, Download } from '@lucide/vue';
import { useLensStore } from '../stores/useLensStore';

const emit = defineEmits(['simulated']);

const store = useLensStore();

const simAuthors = ref(8);
const simRepos   = ref(5);
const simMin     = ref(5);
const simMax     = ref(50);
const showSimConfirm  = ref(false);
const pendingSimParams = ref(null);

function hasUserTeams() {
  return store.teams.some(t => !t.id.startsWith('sim-team-'));
}

function generate() {
  const params = {
    authorCount: simAuthors.value,
    repoCount:   simRepos.value,
    minCommits:  simMin.value,
    maxCommits:  simMax.value,
  };
  if (hasUserTeams()) {
    pendingSimParams.value = params;
    showSimConfirm.value = true;
    return;
  }
  runSimulation(params);
}

function runSimulation(params) {
  store.loadSimulatedData(params);
  showSimConfirm.value = false;
  pendingSimParams.value = null;
  emit('simulated');
}

function confirmSim() {
  if (pendingSimParams.value) runSimulation(pendingSimParams.value);
}

function cancelSim() {
  showSimConfirm.value = false;
  pendingSimParams.value = null;
}

function exportMappings() {
  const blob = new Blob([store.exportMappings()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'conwaylens-mappings.json' });
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.simulate-card {
  @apply flex-1 flex flex-col gap-5 justify-center px-10 py-8
         border-2 border-dashed border-gray-200 rounded-2xl
         transition-all duration-200 hover:border-brand-teal hover:bg-teal-50/20;
}

.sim-header {
  @apply flex items-center gap-3;
}

.sim-icon {
  @apply text-brand-teal;
}

.sim-title {
  @apply text-xl font-bold text-gray-600;
}

.sim-subtitle {
  @apply text-sm text-gray-400 mt-0.5;
}

.sim-controls {
  @apply flex flex-col gap-1.5;
}

.sim-row {
  @apply flex items-center justify-between mt-2;
}

.sim-label {
  @apply text-sm font-semibold text-gray-500;
}

.sim-value {
  @apply text-sm font-mono font-bold text-brand-blue tabular-nums;
}

.sim-slider {
  @apply w-full h-1.5 rounded-full appearance-none cursor-pointer;
  accent-color: #088F9B;
}

.sim-range-row {
  @apply flex flex-col gap-1.5;
}

.sim-btn {
  @apply mt-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 self-start;
  background: #088F9B;
}
.sim-btn:hover {
  background: #067a85;
}

.sim-confirm-backdrop {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm;
}

.sim-confirm-dialog {
  @apply bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-3;
}

.sim-confirm-title {
  @apply text-base font-bold text-gray-800;
}

.sim-confirm-body {
  @apply text-sm text-gray-600;
}

.sim-confirm-hint {
  @apply text-sm font-semibold;
  color: var(--brand-orange);
}

.sim-confirm-actions {
  @apply flex items-center justify-between gap-3 mt-1 flex-wrap;
}

.sim-confirm-right {
  @apply flex items-center gap-2 ml-auto;
}

.sim-export-btn {
  @apply flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150;
  color: var(--brand-teal);
  border-color: var(--brand-teal);
  background: white;
}
.sim-export-btn:hover { background: #f0fafa; }

.sim-cancel-btn {
  @apply text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white hover:border-gray-300 transition-all duration-150;
}

.sim-proceed-btn {
  @apply text-sm font-bold px-4 py-1.5 rounded-lg text-white transition-all duration-150;
  background: var(--brand-orange);
}
.sim-proceed-btn:hover { filter: brightness(0.9); }
</style>
