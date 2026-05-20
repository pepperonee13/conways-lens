import { computed } from 'vue'
import { useLensStore } from '../stores/useLensStore.js'

export function useAnonymize() {
  const enabled = import.meta.env.VITE_ANONYMIZE_AUTHORS === 'true'
  if (!enabled) return { anonymize: n => n, enabled: false }

  const store = useLensStore()

  // Stable map: canonical name → "Author N" (sorted alphabetically so index is deterministic)
  const canonicalMap = computed(() => {
    const map = {}
    store.allAuthors.forEach((name, i) => { map[name] = `Author ${i + 1}` })
    return map
  })

  function anonymize(name) {
    if (!name) return name
    const canonical = store.authorNormalizations[name] ?? name
    return canonicalMap.value[canonical] ?? canonicalMap.value[name] ?? name
  }

  return { anonymize, enabled }
}
