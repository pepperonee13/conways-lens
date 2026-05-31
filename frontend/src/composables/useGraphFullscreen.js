import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';

export function useGraphFullscreen({ containerRef, dims }) {
  const isFullscreen = ref(false);

  function updateSize() {
    if (isFullscreen.value) {
      const pad      = 24; // 12px each side
      const headerEl = containerRef.value?.querySelector('.graph-header');
      const headerH  = headerEl ? headerEl.getBoundingClientRect().height : 56;
      dims.w = window.innerWidth  - pad;
      dims.h = window.innerHeight - headerH - pad;
      return;
    }
    if (!containerRef.value) return;
    const r = containerRef.value.getBoundingClientRect();
    dims.w = Math.max(500, r.width - 48);
    dims.h = Math.max(400, Math.min(800, dims.w * 0.65));
  }

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
    nextTick(() => updateSize());
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && isFullscreen.value) {
      isFullscreen.value = false;
      nextTick(() => updateSize());
    }
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  let onResize;
  onMounted(() => {
    updateSize();
    onResize = debounce(updateSize, 150);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', handleKeyDown);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', handleKeyDown);
  });

  return { isFullscreen, toggleFullscreen, updateSize };
}
