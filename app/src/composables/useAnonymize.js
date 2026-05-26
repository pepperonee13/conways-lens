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

function hash(str, seed) {
  let h = seed
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0
  }
  return h
}

function fakeNameFor(canonical) {
  const first = FIRST[hash(canonical, 0x811c9dc5) % FIRST.length]
  const last = LAST[hash(canonical, 0xdeadbeef) % LAST.length]
  return `${first} ${last}`
}

export function useAnonymize() {
  const enabled = import.meta.env.VITE_ANONYMIZE_AUTHORS === 'true'
  if (!enabled) return { anonymize: n => n, enabled: false }

  const store = useLensStore()

  const canonicalMap = computed(() => {
    const baseFor = (name) => fakeNameFor(name)

    // Two-pass: identify base aliases shared by >1 canonical name. Those names
    // get a deterministic numeric suffix derived only from their own hash, so
    // collision resolution is independent of iteration order. Authors whose
    // base alias is unique keep it as-is.
    const baseCounts = {}
    store.allAuthors.forEach((name) => {
      const b = baseFor(name)
      baseCounts[b] = (baseCounts[b] ?? 0) + 1
    })

    const map = {}
    const used = new Set()
    store.allAuthors.forEach((name) => {
      let fake = baseFor(name)
      if (baseCounts[fake] > 1) {
        // Deterministic disambiguator from name only.
        const disc = hash(name, 0xcafebabe) % 9973
        fake = `${fake} ${disc}`
      }
      // Final safety net: if a residual collision remains (extremely rare —
      // requires both base alias and disc-hash to collide), append a bounded
      // counter to guarantee termination. Order-dependent only for these.
      let suffix = 1
      let candidate = fake
      while (used.has(candidate) && suffix < 1000) {
        candidate = `${fake}-${suffix++}`
      }
      used.add(candidate)
      map[name] = candidate
    })
    return map
  })

  function anonymize(name) {
    if (!name) return name
    const canonical = store.authorNormalizations[name] ?? name
    return canonicalMap.value[canonical] ?? canonicalMap.value[name] ?? name
  }

  return { anonymize, enabled }
}
