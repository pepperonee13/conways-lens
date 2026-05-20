import { computed } from 'vue'
import { useLensStore } from '../stores/useLensStore.js'

const FIRST = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry',
  'Iris', 'James', 'Kate', 'Leo', 'Maya', 'Nathan', 'Olivia', 'Paul',
  'Quinn', 'Rachel', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yara', 'Zoe', 'Adrian', 'Bella', 'Carlos', 'Diana', 'Ethan', 'Fiona',
  'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Marcus', 'Nina',
]

const LAST = [
  'Adams', 'Baker', 'Carter', 'Davis', 'Evans', 'Foster', 'Garcia', 'Harris',
  'Irving', 'Jones', 'King', 'Lewis', 'Martin', 'Nelson', 'Owen', 'Parker',
  'Quinn', 'Reed', 'Smith', 'Taylor', 'Underwood', 'Vance', 'Walker', 'Xavier',
  'Young', 'Zhang', 'Brooks', 'Chen', 'Dixon', 'Ellis', 'Flynn', 'Grant',
  'Hayes', 'Ito', 'Jensen', 'Khan', 'Lee', 'Moore', 'Nash', 'Ortiz',
]

// 40 × 40 = 1600 unique combinations
function fakeNameForIndex(i) {
  return `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`
}

export function useAnonymize() {
  const enabled = import.meta.env.VITE_ANONYMIZE_AUTHORS === 'true'
  if (!enabled) return { anonymize: n => n, enabled: false }

  const store = useLensStore()

  // Stable map: canonical name → fake name (sorted alphabetically so index is deterministic)
  const canonicalMap = computed(() => {
    const map = {}
    store.allAuthors.forEach((name, i) => { map[name] = fakeNameForIndex(i) })
    return map
  })

  function anonymize(name) {
    if (!name) return name
    const canonical = store.authorNormalizations[name] ?? name
    return canonicalMap.value[canonical] ?? canonicalMap.value[name] ?? name
  }

  return { anonymize, enabled }
}
