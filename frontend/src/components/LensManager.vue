<template>
  <button class="floating-lens-btn" v-if="!open" @click="open = true" title="Manage lenses">
    <Layers :size="18" />
    <span>Lenses</span>
    <span v-if="lenses.length" class="lens-badge">{{ lenses.length }}</span>
  </button>

  <transition name="backdrop-fade">
    <div v-if="open" class="backdrop" @click="open = false"></div>
  </transition>

  <transition name="slide-panel-left">
    <div v-if="open" class="panel">

      <!-- Header -->
      <div class="panel-header">
        <h2 class="panel-title"><Layers :size="20" class="title-icon" /> Lenses</h2>
        <button class="close-btn" @click="open = false" title="Close"><X :size="18" /></button>
      </div>

      <!-- Save row -->
      <div class="save-row">
        <input
          v-model="newLensName"
          class="lens-name-input"
          placeholder="Lens name…"
          maxlength="60"
          @keyup.enter="handleSave"
        />
        <button class="save-btn" :disabled="!newLensName.trim()" @click="handleSave">
          <Plus :size="14" /> Save
        </button>
      </div>

      <!-- Lens list -->
      <div class="panel-body">
        <p v-if="!lenses.length" class="empty-state">
          No saved lenses yet.<br />Enter a name above and click Save to capture the current configuration.
        </p>
        <ul v-else class="lens-list">
          <li
            v-for="lens in lenses"
            :key="lens.id"
            :class="['lens-row', { 'lens-row--active': lens.id === activeLensId }]"
          >
            <span class="active-dot" v-if="lens.id === activeLensId" title="Active lens" />
            <div class="lens-info">
              <span
                v-if="renamingId !== lens.id"
                class="lens-name"
                @dblclick="startRename(lens)"
                title="Double-click to rename"
              >{{ lens.name }}</span>
              <input
                v-else
                :ref="el => { if (el) renameInputRefs[lens.id] = el; }"
                class="lens-rename-input"
                v-model="renameValue"
                maxlength="60"
                @blur="commitRename(lens.id)"
                @keyup.enter="commitRename(lens.id)"
                @keyup.escape="renamingId = null"
              />
              <span class="lens-date">{{ lens.createdAt }}</span>
            </div>
            <div class="lens-actions">
              <button class="action-btn" title="Load lens" @click="handleLoad(lens.id)">
                <LogIn :size="13" />
              </button>
              <button class="action-btn" title="Overwrite with current state" @click="handleOverwrite(lens.id)">
                <SaveIcon :size="13" />
              </button>
              <button class="action-btn" title="Export as JSON" @click="handleExport(lens.id)">
                <Download :size="13" />
              </button>
              <button class="action-btn action-btn--danger" title="Delete lens" @click="handleDelete(lens.id)">
                <Trash2 :size="13" />
              </button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Footer: import -->
      <div class="panel-footer">
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleImport" />
        <span v-if="importError" class="import-error">{{ importError }}</span>
        <button class="footer-btn" @click="fileInput.click()">
          <Upload :size="14" /> Import lens JSON
        </button>
      </div>

    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';
import { Layers, X, Plus, LogIn, Save as SaveIcon, Download, Trash2, Upload } from '@lucide/vue';

const store = useLensStore();
const { lenses, activeLensId, uiLensOpen } = storeToRefs(store);

const open = computed({
  get: () => uiLensOpen.value,
  set: v  => { uiLensOpen.value = v; },
});

const newLensName     = ref('');
const renamingId      = ref(null);
const renameValue     = ref('');
const renameInputRefs = reactive({});
const fileInput       = ref(null);
const importError     = ref('');

function handleSave() {
  if (!newLensName.value.trim()) return;
  store.saveLens(newLensName.value);
  newLensName.value = '';
}

function handleLoad(id) {
  store.loadLens(id);
  open.value = false;
}

function handleOverwrite(id) {
  store.overwriteLens(id);
}

function handleExport(id) {
  const json = store.exportLens(id);
  if (!json) return;
  const lens = lenses.value.find(l => l.id === id);
  const slug = (lens?.name ?? 'lens').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `conwaylens-${slug}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

function handleDelete(id) {
  store.deleteLens(id);
}

function startRename(lens) {
  renamingId.value  = lens.id;
  renameValue.value = lens.name;
  nextTick(() => renameInputRefs[lens.id]?.select());
}

function commitRename(id) {
  if (renameValue.value.trim()) store.updateLens(id, { name: renameValue.value.trim() });
  renamingId.value = null;
}

async function handleImport(e) {
  importError.value = '';
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    store.importLensFromData(JSON.parse(text));
    e.target.value = '';
    open.value = false;
  } catch (err) {
    importError.value = err.message;
  }
}
</script>

<style scoped>
/* ── Floating trigger ── */
.floating-lens-btn {
  @apply fixed left-6 bottom-6 z-40 bg-gradient-to-r from-brand-teal to-teal-400
         text-white rounded-full shadow-2xl px-6 py-4 font-bold text-base cursor-pointer
         transition-all duration-300 hover:scale-110 flex items-center gap-3;
}
.lens-badge {
  @apply bg-white text-brand-teal text-xs font-bold px-2.5 py-1 rounded-full ml-1;
}

/* ── Backdrop ── */
.backdrop {
  @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40;
}
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }

/* ── Panel (slides from left) ── */
.panel {
  @apply fixed left-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 420px; max-width: 95vw;
}
.slide-panel-left-enter-active, .slide-panel-left-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel-left-enter-from, .slide-panel-left-leave-to { transform: translateX(-100%); }

.panel-header {
  @apply bg-gradient-to-r from-teal-700 to-brand-teal text-white
         px-6 py-5 flex items-center justify-between shadow-lg flex-shrink-0;
}
.panel-title { @apply flex items-center gap-2 text-2xl font-bold m-0; }
.title-icon  { @apply opacity-80; }
.close-btn {
  @apply text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center
         justify-center transition-all duration-200 cursor-pointer;
}

/* ── Save row ── */
.save-row {
  @apply flex gap-2 px-5 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0;
}
.lens-name-input {
  @apply flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
         focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal;
}
.save-btn {
  @apply inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
         bg-brand-teal text-white cursor-pointer transition-all duration-150
         hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0;
}

/* ── Body / list ── */
.panel-body {
  @apply flex-1 overflow-y-auto p-5;
  scrollbar-width: thin; scrollbar-color: rgba(8,143,155,0.3) transparent;
}
.empty-state {
  @apply text-sm text-gray-400 text-center leading-relaxed mt-8;
}
.lens-list {
  @apply flex flex-col gap-2 list-none m-0 p-0;
}
.lens-row {
  @apply flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white
         hover:border-brand-teal/40 transition-all duration-150;
}
.lens-row--active {
  @apply border-brand-teal bg-teal-50/60;
}
.active-dot {
  @apply w-2.5 h-2.5 rounded-full bg-brand-teal flex-shrink-0;
}
.lens-info {
  @apply flex flex-col flex-1 min-w-0;
}
.lens-name {
  @apply text-sm font-semibold text-gray-800 truncate cursor-pointer select-none;
}
.lens-rename-input {
  @apply text-sm font-semibold border border-brand-teal rounded px-2 py-0.5
         focus:outline-none focus:ring-1 focus:ring-brand-teal/50 w-full;
}
.lens-date {
  @apply text-xs text-gray-400 mt-0.5;
}
.lens-actions {
  @apply flex items-center gap-1 flex-shrink-0;
}
.action-btn {
  @apply w-7 h-7 flex items-center justify-center rounded-lg text-gray-400
         hover:bg-gray-100 hover:text-brand-teal transition-all duration-150 cursor-pointer;
}
.action-btn--danger { @apply hover:bg-red-100 hover:text-red-500; }

/* ── Footer ── */
.panel-footer {
  @apply flex items-center gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0;
}
.footer-btn {
  @apply inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
         border border-gray-300 text-gray-600 bg-white cursor-pointer
         hover:border-brand-teal hover:text-brand-teal transition-all duration-150;
}
.import-error { @apply text-xs text-red-600 flex-1 truncate; }
</style>
