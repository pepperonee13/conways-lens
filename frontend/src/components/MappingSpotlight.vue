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
        <!--
          Hint: label + right-pointing arrow, sitting to the LEFT of the FAB
          at the same vertical centre. This avoids the wide-label-over-corner
          alignment problem entirely.

          FAB metrics (Tailwind):
            right-6  = 1.5rem = 24px
            bottom-6 = 1.5rem = 24px
            h-12     = 3rem   = 48px   → vertical centre at bottom: 3rem
            approx width at rest ≈ 3rem (icon + padding)
        -->
        <div class="spotlight-hint" @click.stop>
          <span class="spotlight-label">Open <strong>Mapping</strong> to configure teams</span>
          <!-- right-pointing arrow -->
          <svg class="spotlight-arrow" viewBox="0 0 40 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 12 H36" stroke="white" stroke-width="2" stroke-linecap="round"/>
            <path d="M28 5 L37 12 L28 19" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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

function dismiss() { store.dismissSpotlight(); }

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

/*
  Hint sits to the left of the FAB, vertically centred on it.

  FAB centre from bottom: bottom-6 (1.5rem) + h-12/2 (1.5rem) = 3rem
  Hint height ≈ 2.25rem (label ~2rem + a bit of gap), so:
    bottom: 3rem - 1.125rem ≈ 1.875rem  → use 1.75rem for a touch of breathing room

  FAB left edge ≈ right-6 (1.5rem) + FAB width (~3rem) = 4.5rem from right
  Add gap (0.75rem) → hint right edge at: 4.5rem + 0.75rem = 5.25rem from right
*/
.spotlight-hint {
  position: fixed;
  bottom: 1.75rem;
  right: 5.5rem;
  display: flex;
  align-items: center;
  gap: 0.625rem;
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
  flex-shrink: 0;
  width: 40px;
  height: 24px;
  opacity: 0.85;
}

/*
  Ring centred on the FAB.

  FAB centre from right:  1.5rem + 1.5rem = 3rem
  FAB centre from bottom: 1.5rem + 1.5rem = 3rem
  Ring diameter: 4rem → radius 2rem
  Ring right:   3rem - 2rem = 1rem
  Ring bottom:  3rem - 2rem = 1rem
*/
.spotlight-ring {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  width: 4rem;
  height: 4rem;
  border-radius: 9999px;
  pointer-events: none;
  box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.9);
  animation: pulse-ring 1.6s ease-out infinite;
}

@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.9), 0 0 0 3px  rgba(240, 130, 35, 0.9); }
  70%  { box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.6), 0 0 0 20px rgba(240, 130, 35, 0); }
  100% { box-shadow: 0 0 0 3px rgba(240, 130, 35, 0.9), 0 0 0 20px rgba(240, 130, 35, 0); }
}

.spotlight-enter-active,
.spotlight-leave-active { transition: opacity 0.25s ease; }
.spotlight-enter-from,
.spotlight-leave-to     { opacity: 0; }
</style>
