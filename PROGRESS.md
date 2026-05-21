# ConwaysLens — Development Progress

> Working branch: `claude/analyze-team-structure-SHwSk`
> Last updated: 2026-05-21

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

**Four hull rendering options:**

| Option | Approach | Verdict |
|---|---|---|
| ① Weighted phantom points | Phantom point at `centroid + (repoPos-centroid) * weight`; hull stays crisp but honest | Conservative, principled |
| ② Concentric shells | 4 nested hulls at 0/3.5/8/18% thresholds; read like a contour map | Good information density |
| ③ SVG blur layers | 3 layers: full-extent (blurred+faint), sig>7% (blurred), crisp core | Liked in isolation |
| ④ Kernel density field | Gaussian blobs with `sqrt(weight)`-scaled radius/opacity, heavy blur; no hard boundary | Liked in isolation |

**Structured layout mode (added in second prototype commit):**

A second graph mode where positions are fully data-driven (not force-directed):
- Authors fixed in horizontal team bands on the left; repos on the right
- Team backgrounds are colored band rectangles — not spatial hulls
- Dragging disabled; layout is stable and repeatable
- Cross-team edges that cross a band line are unambiguous Conway's Law signals regardless of node count or screen size

**Dataset — e-commerce platform (4 teams, 10 authors, 12 repos):**

| Scenario | Story | Signal |
|---|---|---|
| A — Conway violation | Alice (Backend) does 32% + 14% of work in Frontend repos | 🔴 Strong |
| B — API coupling | Dave + Eve (Frontend) write their own backend-api changes | 🔴/🟡 |
| C — Shared infra | Everyone adds CI pipelines to Platform repos | 🔴/🟡 |
| D — Healthy isolation | Data team barely leaves their own band (2–5%) | ⚪ Weak |

---

### Graph improvements & Playwright POM (`74c722f` / `b092ab1`)

**Edge weight encoding (on by default):**
- Cross-team edges colored with the author's team color; within-team edges muted gray (`#94a3b8`, opacity 0.18)
- Stroke width scales with commit volume: `1 + log1p(commits) * 0.9`
- `edgeSrcColor()` / `edgeStrokeWidth()` / `edgeStrokeOpacity()` helpers extracted for clean reuse
- Arrowhead: `markerUnits="userSpaceOnUse"`, `markerWidth/Height=14`, fill `context-stroke` so the arrowhead always matches the edge color

**Bidirectional arc rendering:**
- When two nodes have edges in both directions, they render as opposing quadratic Bézier arcs rather than overlapping straight lines
- Both directions use `curvature = 1`; reversing the edge naturally negates `ux`/`uy`, placing control points on opposite sides of the midpoint
- Key insight: using `-1` for one direction and `+1` for the other cancels out because ux/uy also negate — both must be `+1`

**Show authors toggle (off by default):**
- When off: individual author nodes are hidden; their edges are aggregated up to the team node (`team:X → repo`)
- Aggregation keyed on `src\x00tgt` with commit sums
- Authors whose team is currently expanded (no team node visible) are silently skipped

**Force scaling with node count:**
- `chargeScale = max(1, nodeCount / 5)` — repulsion grows with graph density
- `linkScale = max(1, sqrt(nodeCount / 5))` — link distance grows more slowly
- Prevents collapse in all-expanded views with many nodes

**Anchor pill position:**
- Floats above the topmost node in the team cluster (`minY - 22`), not at the centroid
- Centered on the horizontal midpoint of the cluster

**Minor fixes:**
- Tooltip grammar: `"repo"` / `"repos"`, `"dev"` / `"devs"` (singular/plural)

**Playwright POM (`playwright/lens-page.mjs`):**
- `LensPage` class wraps all browser interactions: `loadCSV`, `importMappings`, `expandNode`, `collapseNode`, `hoverNode`, `screenshot`
- `_clickSvgLabel(name)` dispatches a click event on the closest `<g>` ancestor of the matching SVG `<text>` node
- `screenshot.mjs` rewritten to use the POM (35 lines vs original boilerplate)
- `.claude/skills/run-app/SKILL.md` documents the POM for future AI sessions

---

### Hull/boundary visualizations — tried and removed (`9fceb12`)

Three approaches to team boundary rendering were implemented and then fully removed:

1. **Convex hull** (original, from PR #2): extended to cross-team repos via link traversal — misleading, showed "influence" rather than ownership
2. **Gooey metaball** (`feGaussianBlur` stdDeviation=20 + `feColorMatrix` threshold): merged overlapping circles into organic blobs, but created hard edges and looked harsh
3. **KDE density field** (from prototype option ④): per-team pure Gaussian blur (stdDeviation=38), soft gradients, owned nodes + cross-team phantom blobs scaled by `sqrt(weight)` — softer but still added visual noise without sufficient clarity payoff

**Decision: removed entirely.** The graph is cleaner without any territory overlay. The feature may be revisited when the use case is better understood at scale.

---

## Failures & What to Avoid

- **Hull/boundary overlays hurt more than they help at this stage.** All three implementations added visual complexity without making Conway signals clearer. The prototype has good reference implementations, but none should be automatically integrated — validate with real data at scale first.

- **Shared SVG filter across teams causes color bleeding.** A single `feGaussianBlur` filter referenced by all teams merges their blobs if they overlap in screen space. If boundaries are ever revisited: one filter element per team.

- **`feColorMatrix` for alpha thresholding creates harsh boundaries.** The `0 0 0 12 -4` trick turns a Gaussian into a hard-edged metaball outline. It looked more like a border than a territory, which is not what users want from a "soft cloud" metaphor.

- **Bidirectional arc math trap.** Using `curvature = +1` for one edge direction and `-1` for the other looks correct but silently cancels: reversed edges also negate `ux`/`uy`, so the perpendicular offset lands on the same side. Both must use `curvature = 1`.

- **`forceX` strength reduction breaks all-expanded views.** Reducing strength below `0.09` to spread nodes out more caused nodes to drift off-canvas in dense graphs. Keep `0.09` for non-team nodes.

- **`vite: not found` during build:** Ran `npm run build` from the repo root instead of `app/`. All npm commands must run from `app/`.

- **`git add` path errors:** Staging files using relative paths from wrong working directory. Always run git from `/home/user/conways-lens`.

---

## Open Questions

**1. Hull / boundary semantics — deferred**
All boundary implementations have been removed. The question of what "team territory" means in a force-directed layout (ownership vs. influence vs. contribution density) remains open. Revisit when the tool is being used with real large-scale data and users can articulate what they need.

**2. Structured layout mode in the main app**
The prototype has a working structured layout (team bands, stable positions). It hasn't been ported to the main app. At scale (100+ contributors), the structured view is likely more legible than force-directed for Conway's Law analysis.

**3. Violation rings**
Thin arcs on nodes encoding % cross-team involvement were designed (2026-05-20) but never implemented. Still the highest-value unbuilt feature.

**4. Weight threshold for violation rings**
Tentatively 10% minimum to suppress noise. Whether user-configurable or fixed TBD.

**5. Multi-team author assignment UX**
MappingEditor lets authors be assigned to multiple teams with no visual warning that they'll appear in multiple team nodes. A badge or info tooltip would help.

**6. Folder drill-down requires FilePath in CSV**
Only repos with `FilePath` data can be drilled into. Correct behavior — but worth surfacing to users clearly (a "no folder data" state label on repo nodes that can't expand).

---

## Next Steps (Rough Priority)

### High — violation rings (designed, ready to build)

1. **"Violation rings" toggle in the Visualization dropdown (default off)**
   - Thin outer arc on each visible node; arc length = % cross-team involvement
   - Author node: % of commits that went to outside-team repos
   - Repo node: % of commits from outside-team authors
   - Arc color: brand orange `#F08223` (warning color, independent of team)
   - Hide arc entirely if cross-team % < 10% (noise reduction)
   - Ephemeral — not persisted to localStorage

### Medium — structured layout mode

2. **Add structured layout as a second graph mode**
   - Toggle: "Force-directed" / "Structured" in graph header
   - Team bands with colored backgrounds, fixed bipartite positions, no dragging
   - Most legible Conway view at scale (100+ contributors)

### Medium — UX polish

3. **Folder drill-down state label** — show "no folder data" on repo nodes that can't expand (currently they have a + badge that does nothing)
4. **Multi-team author badge in MappingEditor** — warn when an author is in more than one team
5. **Sensitivity slider** — single control for ring minimum threshold (future: also gates boundary thresholds if boundaries ever return)

### Lower — documentation

6. `repos.json.example` with comments
7. Document that `FilePath` column is required for folder drill-down

---

## Files at a Glance

| File | Role |
|---|---|
| `app/src/stores/useLensStore.js` | Central Pinia store: all data, computed graph, drill-down state |
| `app/src/components/NetworkGraph.vue` | D3 force simulation, all rendering, drill-down click handling |
| `app/src/components/MappingEditor.vue` | Team CRUD, author normalization, import/export |
| `app/src/views/LensView.vue` | Root layout, CSV upload/drag-drop |
| `app/src/composables/useAnonymize.js` | Display-only author name pseudonymization |
| `boundary-styles-prototype.html` | Self-contained prototype for boundary style comparison (reference only) |
| `playwright/lens-page.mjs` | Playwright Page Object Model for all browser automation |
| `screenshot.mjs` | Demo script — captures 5 canonical screenshots using POM |
| `analysis/Analyse-Repositories.ps1` | PowerShell: clone repos, extract git history → TimelineData.csv |
| `analysis/repos.json` | List of repos to analyse |
