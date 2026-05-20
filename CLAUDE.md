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
```

## Architecture

### Data Flow

```
repos.json → Analyse-Repositories.ps1 → TimelineData.csv
                                                ↓
                                    (user uploads via drag-drop)
                                                ↓
                                    useLensStore (Pinia)
                                      ├─ timelineData (raw)
                                      ├─ effectiveData (author-normalized)
                                      └─ filteredData (date/repo/author filtered)
                                                ↓
                                    NetworkGraph.vue (D3 force simulation)
```

### Key Files

- **`app/src/stores/useLensStore.js`** — Central Pinia store. Parses CSV with PapaParse (including metadata footer `Since=...,Until=...`), manages teams, author normalizations, and filters. Everything persists to localStorage automatically.
- **`app/src/components/NetworkGraph.vue`** — D3 force-directed graph (~635 lines). Two modes: *Auto* (bipartite author↔repo when no teams defined) and *Team* (cross-team contribution flows). Supports node drag, drill-down clicks, and tooltips.
- **`app/src/components/FilterPanel.vue`** — Floating panel for date ranges, repo/author/team filtering, and summary stats.
- **`app/src/components/MappingEditor.vue`** — Floating panel for team CRUD, author assignment, and author alias normalization (multiple git identities → one canonical name). Supports JSON import/export.
- **`app/src/views/LensView.vue`** — Root layout; handles CSV file upload/drag-drop.

### Graph Modes

- **Auto mode** (no teams configured): Bipartite graph with author nodes on one side and repo nodes on the other.
- **Team mode**: Nodes represent teams; edges show cross-team contributions; edge width ∝ commit volume.
- **Drill-down**: Clicking a team node zooms into repos that received cross-team contributions for that team.

### State Shape (useLensStore)

```js
timelineData       // Raw parsed CSV rows
teams              // { id, name, color, authors[], repos[] }
authorNormalizations // { "raw git name" → "canonical name" }
filters            // { since, until, repos[], authors[], teams[] }
```

`effectiveData` and `filteredData` are computed from the above. `multiTeamProducts` is the computed list of repos with contributions from more than one team.

### CSV Format

The analysis script outputs a CSV with columns: `Repository`, `Author`, `Date`, `Files`. A metadata footer line `Since=YYYY-MM-DD,Until=YYYY-MM-DD` is appended after the data rows; the store parses and strips it.

## Styling

- Tailwind CSS utility-first; custom brand colors defined in `tailwind.config.js` and as CSS variables in `app/src/variables.css`.
- Brand palette: blue `#225EA9`, teal `#088F9B`, orange `#F08223`, gray `#2F3944`.
- Fonts: Inter (UI), JetBrains Mono (data/code display).
- Floating panels use a backdrop overlay and slide-in transition.
