/**
 * AppTour — stable wrapper around driver.js.
 *
 * All driver.js imports and API details are confined here.
 * To swap the underlying library, replace this file only —
 * callers depend solely on the two exported functions and the
 * step / options shapes documented below.
 *
 * Step shape:
 *   { element: string (CSS selector), title?: string,
 *     description?: string, side?: string, align?: string }
 *
 * Options shape (shared by both functions):
 *   { onDismiss?: () => void, allowClose?: boolean, overlayOpacity?: number }
 *
 * startTour() additional options:
 *   { showProgress?: boolean }
 */
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// Match the popover shape to the app's pill-style FAB buttons.
// Injected once here so the override stays co-located with all other driver.js knowledge.
const STYLE_ID = 'app-tour-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `.driver-popover { border-radius: 9999px !important; padding: 1.25rem 1.75rem !important; }`;
  document.head.appendChild(s);
}

function adaptStep({ element, title = '', description = '', side = 'left', align = 'center' }) {
  return { element, popover: { title, description, side, align } };
}

function makeDriver(driverOptions, onDismiss) {
  // driver.js fires onDestroyStarted and returns early when the user triggers
  // close (overlay click, Escape, × button) — the overlay stays mounted until
  // d.destroy() is called from within this hook to complete the cleanup.
  // The externalDestroy guard prevents onDismiss from firing a second time
  // when our own destroy() wrapper calls d.destroy() programmatically
  // (which bypasses onDestroyStarted entirely via g(false) internally).
  let externalDestroy = false;

  const d = driver({
    ...driverOptions,
    onDestroyStarted: () => {
      if (!externalDestroy && onDismiss) onDismiss();
      d.destroy(); // complete the cleanup driver.js deferred to us
    },
  });

  return {
    instance: d,
    destroy() {
      externalDestroy = true;
      d.destroy();
    },
  };
}

/**
 * Highlights a single element with a popover — no progress, no prev/next.
 * A ResizeObserver keeps the spotlight in sync as the element's size changes
 * (e.g. a FAB that expands on hover via a CSS transition).
 */
export function highlightElement(step, options = {}) {
  const { onDismiss, allowClose = true, overlayOpacity = 0.5 } = options;
  const { instance, destroy } = makeDriver({ allowClose, overlayOpacity }, onDismiss);
  instance.highlight(adaptStep(step));

  const el = document.querySelector(step.element);
  const observer = el ? new ResizeObserver(() => instance.refresh()) : null;
  if (observer) observer.observe(el);

  return {
    destroy() {
      observer?.disconnect();
      destroy();
    },
  };
}

/**
 * Drives a multi-step tour.
 */
export function startTour(steps, options = {}) {
  const { onDismiss, allowClose = true, overlayOpacity = 0.5, showProgress = true } = options;
  const { instance, destroy } = makeDriver(
    { allowClose, overlayOpacity, showProgress, steps: steps.map(adaptStep) },
    onDismiss,
  );
  instance.drive();
  return { destroy };
}
