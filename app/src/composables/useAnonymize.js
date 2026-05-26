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
    const map = {}
    const used = new Set()
    store.allAuthors.forEach((name) => {
      let fake = fakeNameFor(name)
      let salt = 1
      while (used.has(fake)) {
        fake = fakeNameFor(name + ':' + salt++)
      }
      used.add(fake)
      map[name] = fake
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
