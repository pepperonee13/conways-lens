// Centralized read of Vite-exposed env vars. Anything that reads
// `import.meta.env.VITE_*` belongs here so component/composable code
// stays free of env-parsing logic.

function parseBool(raw, fallback) {
  if (raw === undefined || raw === '') return fallback
  const s = String(raw).toLowerCase()
  if (s === 'true' || s === '1') return true
  if (s === 'false' || s === '0') return false
  return fallback
}

function parsePercent(raw, fallback) {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
}

export const ANONYMIZE_AUTHORS = parseBool(
  import.meta.env.VITE_ANONYMIZE_AUTHORS, false,
)

export const DEFAULT_VIOLATION_THRESHOLD = parsePercent(
  import.meta.env.VITE_MIN_VIOLATION_PCT, 10,
)

export const DEFAULT_DISPLAY_AUTHORS = parseBool(
  import.meta.env.VITE_DISPLAY_AUTHORS_DEFAULT, true,
)
