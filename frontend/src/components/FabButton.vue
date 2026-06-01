<template>
  <button class="fab" :class="`expand-${expand}`" :style="{ background: COLORS[color].gradient }">
    <span class="fab-icon"><slot /></span>
    <span class="fab-expand">
      <span class="fab-label">{{ label }}</span>
      <span v-if="badge" class="fab-badge" :style="{ color: COLORS[color].accent }">{{ badge }}</span>
    </span>
  </button>
</template>

<script setup>
defineProps({
  label:  { type: String, required: true },
  badge:  { type: Number, default: null },
  color:  { type: String, default: 'teal' },   // 'teal' | 'orange'
  expand: { type: String, default: 'right' },  // 'right' | 'left'
});

const COLORS = {
  teal:   { gradient: 'linear-gradient(to right, #067a85, #088F9B)', accent: '#088F9B' },
  orange: { gradient: 'linear-gradient(to right, #D47113, #F08223)', accent: '#F08223' },
};
</script>

<style scoped>
.fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 3rem;
  padding: 0 0.875rem;
  border-radius: 9999px;
  color: white;
  font-weight: 700;
  font-size: 0.875rem;
  box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.25), 0 4px 10px -6px rgb(0 0 0 / 0.15);
  cursor: pointer;
  transition: padding var(--transition-base), box-shadow var(--transition-base);
}

.fab:hover {
  padding: 0 1.25rem;
  box-shadow: 0 15px 30px -5px rgb(0 0 0 / 0.3), 0 6px 12px -6px rgb(0 0 0 / 0.2);
}

.fab-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.fab-expand {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  opacity: 0;
  transition:
    max-width var(--transition-base),
    opacity 0.12s ease,
    margin var(--transition-base);
}

.fab:hover .fab-expand {
  max-width: 12rem;
  opacity: 1;
}

.fab.expand-right { flex-direction: row; }
.fab.expand-right .fab-expand { margin-left: 0; }
.fab.expand-right:hover .fab-expand { margin-left: 0.5rem; }

.fab.expand-left { flex-direction: row-reverse; }
.fab.expand-left .fab-expand { margin-right: 0; }
.fab.expand-left:hover .fab-expand { margin-right: 0.5rem; }

.fab-badge {
  background: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  flex-shrink: 0;
  line-height: 1.4;
}
</style>
