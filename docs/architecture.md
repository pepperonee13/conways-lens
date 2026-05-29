# Architecture

## Data flow

```
repos.json (copy of repos.example.json) → Analyse-Repositories.ps1 → TimelineData.csv
                                                ↓
                                    (user uploads via drag-drop)
                                                ↓
                                    useLensStore (Pinia)
                                      ├─ timelineData (raw CSV rows)
                                      ├─ graphData (deduped edges + nodes)
                                      └─ crossTeamOnly (filter flag)
                                                ↓
                                    NetworkGraph.vue (D3 force simulation)
```

## Key files

- **`app/src/stores/useLensStore.js`** — Central Pinia store. Parses CSV with PapaParse (including metadata footer `Since=...,Until=...`), manages teams, author normalizations, ignored authors, and the `crossTeamOnly` filter flag. Teams, normalizations, and ignored authors persist to localStorage automatically.
- **`app/src/components/NetworkGraph.vue`** — D3 force-directed bipartite graph. Authors on the left, repos on the right. When teams are configured: draws colour-coded convex hull backgrounds per team, applies a team-gravity force to cluster team members, and shows a "Cross-team only" toggle that filters edges to only cross-boundary contributions. Supports node drag, zoom/pan, and hover tooltips.
- **`app/src/components/MappingEditor.vue`** — Floating panel for team CRUD, author assignment, and author alias normalization (multiple git identities → one canonical name). Supports JSON import/export.
- **`app/src/views/LensView.vue`** — Root layout; handles CSV file upload/drag-drop.
- **`app/src/composables/useAnonymize.js`** — Any UI that displays an author name must wrap it with `anonymize()` from this composable. Display-only; store data and JSON export always use real names.

## Store state shape

```js
timelineData         // Raw parsed CSV rows
teams                // { id, name, color, authors[], repos[] }
authorNormalizations // { "raw git name" → "canonical name" }
ignoredAuthors       // string[] — excluded from graphData entirely
crossTeamOnly        // boolean — when true, graphData only contains cross-team edges
```

`graphData` is computed from all of the above. `nodeColors` maps `"type:id"` keys to team hex colors.

## Styling

- Tailwind CSS utility-first; custom brand colors defined in `tailwind.config.js` and as CSS variables in `app/src/variables.css`.
- Brand palette: blue `#225EA9`, teal `#088F9B`, orange `#F08223`, gray `#2F3944`.
- Fonts: Inter (UI), JetBrains Mono (data/code display).
- Floating panels use a backdrop overlay and slide-in transition.
