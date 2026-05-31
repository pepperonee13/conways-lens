import { reactive } from 'vue';

// Module-level singleton — any component can push toasts without prop-drilling.
const toasts = reactive([]);
let _nextId = 0;

export function useToast() {
  function show(message, duration = 2800) {
    const id = ++_nextId;
    toasts.push({ id, message });
    setTimeout(() => {
      const idx = toasts.findIndex(t => t.id === id);
      if (idx !== -1) toasts.splice(idx, 1);
    }, duration);
  }
  return { toasts, show };
}
