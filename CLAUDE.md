# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ConwayLens is a visualization tool that checks whether team structure and code ownership boundaries match real contribution patterns from git history (Conway's Law applied to software teams). It has two parts:

1. **Analysis script** (`analysis/`): PowerShell script that clones repos and extracts git history into a CSV file.
2. **Vue SPA** (`app/`): Browser app that loads the CSV, lets users define team mappings, and renders a force-directed network graph.

## Commands

All commands run from the `app/` directory:

```bash
npm run dev      # Dev server at http://localhost:5174
npm run build    # Production build to dist/
npm run preview  # Preview the production build
```

There are no test or lint commands — no testing framework or linter is configured.

The analysis script (Windows/PowerShell only):
```powershell
.\analysis\Analyse-Repositories.ps1 -Since 2024-01-01 -Until 2024-12-31
.\analysis\Analyse-Repositories.ps1 -ReposFile C:\projects\my-repos.json  # custom repos config path
.\analysis\Analyse-Repositories.ps1 -WorkDir C:\my-repos                  # custom clone directory
```

## Architecture

### Data Flow

```
repos.json → Analyse-Repositories.ps1 → TimelineData.csv
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

### Key Files

- **`app/src/stores/useLensStore.js`** — Central Pinia store. Parses CSV with PapaParse (including metadata footer `Since=...,Until=...`), manages teams, author normalizations, ignored authors, and the `crossTeamOnly` filter flag. Teams, normalizations, and ignored authors persist to localStorage automatically.
- **`app/src/components/NetworkGraph.vue`** — D3 force-directed bipartite graph. Authors on the left, repos on the right. When teams are configured: draws colour-coded convex hull backgrounds per team, applies a team-gravity force to cluster team members, and shows a "Cross-team only" toggle that filters edges to only cross-boundary contributions. Supports node drag, zoom/pan, and hover tooltips.
- **`app/src/components/MappingEditor.vue`** — Floating panel for team CRUD, author assignment, and author alias normalization (multiple git identities → one canonical name). Supports JSON import/export.
- **`app/src/views/LensView.vue`** — Root layout; handles CSV file upload/drag-drop.
- **`app/src/composables/useAnonymize.js`** — Any UI that displays an author name must wrap it with `anonymize()` from this composable. Display-only; store data and JSON export always use real names.

### Graph Behaviour

- **No teams configured**: Bipartite graph with author circles on the left and repo squares on the right. All contributions shown.
- **Teams configured**: Same bipartite layout, but each team's nodes are enclosed in a semi-transparent hull and cluster together via a gravity force. The "Cross-team only" toggle (graph header) filters `graphData` to edges where the author's team ≠ the repo's team — authors/repos with only within-team contributions are removed automatically.

### State Shape (useLensStore)

```js
timelineData         // Raw parsed CSV rows
teams                // { id, name, color, authors[], repos[] }
authorNormalizations // { "raw git name" → "canonical name" }
ignoredAuthors       // string[] — excluded from graphData entirely
crossTeamOnly        // boolean — when true, graphData only contains cross-team edges
```

`graphData` is computed from all of the above. `nodeColors` maps `"type:id"` keys to team hex colors.

### CSV Format

The analysis script outputs a CSV. Key columns the store reads: `Author`, `Product` (repo name), `ChangesetId` (commit SHA, used for deduplication). A metadata footer line `Since=YYYY-MM-DD,Until=YYYY-MM-DD` is appended after the data rows; the store parses and strips it.

## Styling

- Tailwind CSS utility-first; custom brand colors defined in `tailwind.config.js` and as CSS variables in `app/src/variables.css`.
- Brand palette: blue `#225EA9`, teal `#088F9B`, orange `#F08223`, gray `#2F3944`.
- Fonts: Inter (UI), JetBrains Mono (data/code display).
- Floating panels use a backdrop overlay and slide-in transition.
