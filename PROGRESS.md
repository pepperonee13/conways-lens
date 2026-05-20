# ConwaysLens — Development Progress

> Working branch: `claude/add-drill-down-zoom-0Ne49`
> Last updated: 2026-05-20

---

## What We've Built

### Baseline (initial commit — `9829b76`)

The project started with a working Vue 3 SPA + PowerShell analysis script:
- Drag-and-drop CSV upload with PapaParse (including `Since=…,Until=…` metadata footer)
- FilterPanel for date-range slicing
- MappingEditor for team CRUD, author normalization (alias merging), and ignored authors
- A D3 force-directed graph in NetworkGraph.vue — but at this point it was a general-purpose graph, not bipartite
- All team/normalization/ignore data persisted to localStorage; JSON import/export
- PowerShell analysis script already produced `FilePath` per file-change row (key for later drill-down)

---

### PR #1 — Bipartite layout (`e431a3a`)

Simplified the graph to a strict bipartite layout: **authors on the left, repos on the right**.
- `forceX` nudges authors to `W*0.27`, repos to `W*0.73`
- Eliminated all non-bipartite forces that were fighting the layout
- Established visual language: circles = authors, squares = repos

---

### PR #2 — Cross-team filter + clustering (`c5dd964`)

Teams became first-class citizens in the graph:
- Convex hull backgrounds per team (semi-transparent, team color)
- `teamGravity` custom force clusters each team's nodes together
- **"Cross-team only" toggle** in the graph header: filters `graphData` to edges where author's team ≠ repo's team; nodes with only within-team contributions disappear automatically
- `nodeColors` computed map for consistent color keying across author and repo nodes
- `crossTeamOnly` flag in the Pinia store; `graphData` is a single reactive computed that handles both modes

---

### PR #3 — Author anonymization (`5d6f0e6`)

Added `VITE_ANONYMIZE_AUTHORS=true` build-time flag:
- `useAnonymize.js` composable — `anonymize(name)` replaces real names with deterministic pseudonyms derived from a seed
- Display-only: store, localStorage, and JSON export always use real names
- Any UI component that shows an author name must wrap it with `anonymize()`

---

### Hierarchical drill-down zoom (`189a20d`)

The most significant feature. Teams, repos, and folders can now be expanded and collapsed independently.

**Store changes (`useLensStore.js`):**
- `expandedTeams: ref(new Set())` — which team nodes are currently expanded to show their repos/authors
- `expandedNodes: ref(new Set())` — which repo and folder nodes are expanded to show children
- `reposWithFilePaths` computed — Set of repo IDs that have `FilePath` data in the CSV (gates folder drill-down)
- `toggleTeamExpansion(teamId)` — collapses all child repo/folder expansions recursively on collapse
- `toggleNodeExpansion(nodeId)` — collapses all descendants (`id.startsWith(nodeId + '::')`) on collapse
- `getEffectiveNodeId(repoId, filePath)` inner function in `graphData` computed — walks from team → repo → folder path up to depth 4, stopping at the first unexpanded level

**Node ID scheme:**
| Value | Meaning |
|---|---|
| `"Alice"` | Author node |
| `"backend-api"` | Repo node |
| `"team:alpha"` | Collapsed team node |
| `"backend-api::src/core"` | Folder node inside a repo |
| `"backend-api::(root)"` | Files at root of a repo |

**Multi-team author model:** An author assigned to multiple teams appears in ALL their team nodes. Contributions to repos belonging to any of their teams are absorbed (within-team); contributions to repos of other teams become cross-team edges — even if the author is technically "in" the other team. This correctly models boundary violations.

**Graph component changes (`NetworkGraph.vue`):**
- `isNodeExpandable(d)` — team always expandable; repo only if in `reposWithFilePaths`; folder only if `depth < 4`
- `isNodeExpanded(d)` — checks appropriate Set
- `handleNodeClick(d)` — dispatches to `toggleTeamExpansion` or `toggleNodeExpansion`
- Click vs drag conflict resolved with `d._moved` flag: drag handler sets it, click handler aborts if set
- **Node shapes:** pill/rounded-rect for team nodes, diamond for folder nodes, unchanged circle/square for author/repo
- **+/− badge** on every expandable node at `(r*0.65, -r*0.65)` (non-team) or `(r+10, -r)` (team pills)
- `diamondEdgeDist(ux, uy, r)` — correct edge termination for diamond nodes: `r / (|ux| + |uy|)`
- Hull rendering limited to expanded teams (collapsed team nodes don't draw a hull)
- `teamGravity` force only applies to authors whose team is in `expandedTeams`

---

### Prototype: boundary style comparison (`d56fcd5` + `b56fcf8`)

Standalone `boundary-styles-prototype.html` (no server needed, D3 from CDN) for evaluating how to visualize team territories weighted by cross-team contribution strength.

**Problem being prototyped:** Convex hulls that include cross-team repos (as currently drawn in the main app) can mislead — a single commit from Alice to a distant repo stretches the hull all the way to that repo, suggesting ownership that isn't there. What's the right honest visualization?

**Four hull rendering options:**

| Option | Approach | Verdict |
|---|---|---|
| ① Weighted phantom points | Phantom point at `centroid + (repoPos-centroid) * weight`; hull stays crisp but honest | Conservative, principled |
| ② Concentric shells | 4 nested hulls at 0/3.5/8/18% thresholds; read like a contour map | Good information density |
| ③ SVG blur layers | 3 layers: full-extent (blurred+faint), sig>7% (blurred), crisp core | **User preferred** |
| ④ Kernel density field | Gaussian blobs with `sqrt(weight)`-scaled radius/opacity, heavy blur; no hard boundary | **User preferred** |

**Structured layout mode (added in second prototype commit):**

A second graph mode where positions are fully data-driven (not force-directed):
- Authors fixed in horizontal team bands on the left; repos on the right
- Team backgrounds are colored band rectangles — not spatial hulls
- Dragging disabled; layout is stable and repeatable
- Cross-team edges that cross a band line are unambiguous Conway's Law signals regardless of node count or screen size
- Smooth animation when switching modes (simulation drives nodes to fixed positions)

**Dataset — e-commerce platform (4 teams, 10 authors, 12 repos):**

| Scenario | Story | Signal |
|---|---|---|
| A — Conway violation | Alice (Backend) does 32% + 14% of work in Frontend repos | 🔴 Strong |
| B — API coupling | Dave + Eve (Frontend) write their own backend-api changes | 🔴/🟡 |
| C — Shared infra | Everyone adds CI pipelines to Platform repos | 🔴/🟡 |
| D — Healthy isolation | Data team barely leaves their own band (2–5%) | ⚪ Weak |

---

## Open Questions

**1. Semantics of hull boundaries**
The current main app draws hulls that extend to cross-team repos. User acknowledged this can be misleading but liked the visual signal it provides as a "hint / entry point for further analysis." The honest framing: hulls show *influence* not *ownership*. We haven't decided on final semantics yet.

**2. Which boundary style to ship?**
User liked options ③ (blur layers) and ④ (density field) in the prototype. Neither has been integrated into `NetworkGraph.vue` yet. ④ is more honest (no hard boundary), ③ gives clearer spatial separation. The choice might depend on user feedback at scale.

**3. What to call the hull feature in the UI?**
The user rejected "hull" as a label. "Cross-team boundaries" and "Team territories" were discussed. "Team boundaries" seems to be the leading candidate but hasn't been finalized.

**4. Structured layout in the main app**
The prototype shows that structured layout gives the most honest Conway's Law reading. Should this become a mode in the main app alongside force-directed? The user said they don't want to give up force-directed (the colored zone map is "more telling at the high level"), so both modes would need to coexist.

**5. Weight threshold control**
The prototype hardcodes thresholds (3.5/8/18% for shells, 7% for blur mid-layer). Should these be user-configurable in the main app, or are fixed defaults good enough? A single "sensitivity" slider could control all of them.

**6. Folder drill-down requires FilePath in CSV**
Only repos that have `FilePath` data can be drilled into. The PowerShell script already produces this column, but existing CSVs without it silently disable the feature. This is correct behavior — but worth documenting for users.

**7. Multi-team author assignment UX**
The MappingEditor currently lets authors be assigned to multiple teams, but there's no visual warning in the editor that this person will be "split" across team nodes. A subtle indicator would help.

---

## Failures / Blockers Encountered

- **`vite: not found` during build:** Ran `npm run build` from the repo root instead of `app/`. Fixed by `cd app && npm install && npx vite build`.
- **`git add` path errors:** Attempted to stage files using relative paths from wrong working directory. Fixed by running git from `/home/user/conways-lens`.
- **Hull extends to dragged nodes:** In force-directed mode, if you drag a node far from its team cluster, the hull stretches to follow. This is the core honesty problem that motivated the prototype. No fix yet in the main app.

---

## Next Steps (Rough Priority)

### High — integrate prototype findings into main app

1. **Add team boundary toggle to `NetworkGraph.vue`**
   - Name: "Team boundaries" or "Cross-team boundaries" (not "hull")
   - Default off; toggle in the graph header next to "Cross-team only"
   - Start with option ③ (blur layers) or ④ (density field) based on final decision
   - The toggle state does not need to persist (it's a visual preference, not data)

2. **Choose and integrate one boundary style**
   - Recommendation: start with ③ (blur layers) — it gives clear spatial zones (useful at a glance) while the blurred outer halo communicates uncertainty about peripheral contributions
   - ④ (density field) could be a follow-on or an alternative toggle

### Medium — structured layout mode in main app

3. **Add structured layout as a second graph mode**
   - Toggle: "Force-directed" / "Structured" in graph header or top controls
   - In structured mode: team bands with colored backgrounds, fixed bipartite positions, no dragging
   - Boundaries section (hull rendering) should auto-disable in structured mode
   - This is the most honest view for Conway's Law analysis

4. **Weight threshold sensitivity control**
   - Single slider: "Boundary sensitivity" (low = only show strong signals, high = show weak ones)
   - Maps to the `minW` thresholds in the concentric shell / blur layer renderers

### Lower — polish and UX

5. **Multi-team author indicator in MappingEditor**
   - When an author is assigned to >1 team, show a small badge or warning in the editor
   - Help text: "This author will appear in both team nodes and their cross-team contributions will be counted for each team"

6. **Hull semantics tooltip**
   - When team boundaries are enabled, show a small info icon that explains what the shading means
   - "Shading represents influence, not ownership. Stronger color = more contribution."

7. **Folder drill-down depth indicator**
   - The +/− badge already shows expand/collapse state
   - Consider showing the current depth level (e.g., `+2` for depth 2) as a tiny label

8. **Analysis script documentation**
   - Add a `repos.json.example` with comments explaining each field
   - Document that `FilePath` is required for folder drill-down

---

## Files at a Glance

| File | Role |
|---|---|
| `app/src/stores/useLensStore.js` | Central Pinia store: all data, computed graph, drill-down state |
| `app/src/components/NetworkGraph.vue` | D3 force simulation, all rendering, drill-down click handling |
| `app/src/components/MappingEditor.vue` | Team CRUD, author normalization, import/export |
| `app/src/views/LensView.vue` | Root layout, CSV upload/drag-drop |
| `app/src/composables/useAnonymize.js` | Display-only author name pseudonymization |
| `boundary-styles-prototype.html` | Self-contained prototype for boundary style comparison |
| `analysis/Analyse-Repositories.ps1` | PowerShell: clone repos, extract git history → TimelineData.csv |
| `analysis/repos.json` | List of repos to analyse |
