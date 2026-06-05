<template>
  <Teleport to="body">
    <Transition name="spotlight">
      <div
        v-if="store.showMappingSpotlight"
        class="spotlight-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Open the Mapping editor to get started"
        @click="dismiss"
      >
        <!-- Label + arrow, positioned above the FAB -->
        <div class="spotlight-hint" @click.stop>
          <span class="spotlight-label">Open <strong>Mapping</strong> to configure teams</span>
          <svg class="spotlight-arrow" viewBox="0 0 24 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2 C12 2 12 28 12 30" stroke="white" stroke-width="2" stroke-linecap="round"/>
            <path d="M5 24 L12 32 L19 24" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Pulsing ring centred on the FAB -->
        <div class="spotlight-ring" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useLensStore } from '../stores/useLensStore';

const store = useLensStore();

function dismiss() { store.markMappingOpened(); }

function onKey(e) { if (e.key === 'Escape') dismiss(); }
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.spotlight-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  cursor: pointer;
}

/* Label + arrow sit just above the FAB (bottom-right corner) */
.spotlight-hint {
  position: fixed;
  bottom: 6rem;
  right: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  cursor: default;
  pointer-events: none;
  user-select: none;
}

.spotlight-label {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.5rem;
  padding: 0.5rem 0.875rem;
  color: #fff;
  font-size: 0.875rem;
  white-space: nowrap;
  backdrop-filter: blur(4px);
}

.spotlight-arrow {
  width: 24px;
  height: 40px;
  opacity: 0.85;
}

/* Ring centred over the FAB (fixed bottom-6 right-6, h-12) */
.spotlight-ring {
  position: fixed;
  bottom: 0.5rem;
  right: 0.5rem;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 9999px;
  pointer-events: none;
  box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.9);
  animation: pulse-ring 1.6s ease-out infinite;
}

@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.9), 0 0 0 3px rgba(240, 130, 35, 0.9); }
  70%  { box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.6), 0 0 0 18px rgba(240, 130, 35, 0); }
  100% { box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.9), 0 0 0 18px rgba(240, 130, 35, 0); }
}

/* Transition */
.spotlight-enter-active,
.spotlight-leave-active {
  transition: opacity 0.25s ease;
}
.spotlight-enter-from,
.spotlight-leave-to {
  opacity: 0;
}
</style>
