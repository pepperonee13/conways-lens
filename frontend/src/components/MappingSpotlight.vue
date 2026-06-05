<template><!-- driver.js renders its own overlay; no markup needed here --></template>

<script setup>
import { watch, onMounted, onUnmounted, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';
import { highlightElement } from '../tour/AppTour.js';

const store = useLensStore();
const { showMappingSpotlight } = storeToRefs(store);

let tour = null;

function start() {
  tour = highlightElement(
    {
      element: '[data-testid="fab-mapping"]',
      title: 'Configure Teams',
      description: 'Open <strong>Mapping</strong> to add teams and visualise Conway\'s Law violations.',
      side: 'left',
      align: 'center',
    },
    { onDismiss: () => store.dismissSpotlight() },
  );
}

function stop() {
  tour?.destroy();
  tour = null;
}

onMounted(() => { if (showMappingSpotlight.value) nextTick(start); });
watch(showMappingSpotlight, (show) => { if (show) nextTick(start); else stop(); });
onUnmounted(stop);
</script>
