# 001 — Team↔Repo Graph Redesign

## Context

The current NetworkGraph is author-centric: a bipartite force layout with author circles on
the left and repo squares on the right. Teams are a secondary overlay (hulls, gravity, collapsed
pills). This is the wrong primary model for the tool's actual purpose.

The tool's job is to give enterprise/area architects a signal: **do team boundaries still match
reality?** The unit of concern is the repository (= bounded context). A repo touched by multiple
teams violates the single-mental-model principle. A team working across multiple repos it owns
is fine.

The redesign replaces the author-centric graph with a **team↔repo bipartite** where:
- Teams are always the source of contributions (edges originate from team nodes)
- Repos are always the target (edges terminate at repo nodes)
- Any edge that crosses a team's hull boundary is a violation — readable directly from topology
- Author nodes are removed entirely from the primary view

---

## Plan

### Step 1 — Define the renderer interface

Create `app/src/composables/graphs/useGraphRenderer.js` as a documented contract that every
graph renderer must satisfy. The interface:

```js
{
  draw(context),        // initial render; context = { svgRef, dims, data, config }
  updateEdgeStyles(),   // reapply edge colors/widths without full redraw
  updateNodeColors(),   // reapply node fill colors without full redraw
  drawOverlays(),       // redraw boundary hulls / rings without touching nodes or edges
  teardown(),           // stop simulation, remove listeners
}
```

`NetworkGraph.vue` will hold a `currentRenderer` ref and delegate all D3 work through this
interface. It never calls D3 directly itself.

---

### Step 2 — Extract the current renderer

Move all D3 logic from `NetworkGraph.vue` into
`app/src/composables/graphs/useAuthorRepoBipartite.js`, implementing the interface from Step 1.
No behaviour change — this is a mechanical extraction.

`NetworkGraph.vue` becomes a shell: template, controls, tooltip, resize, watchers, and calls to
`currentRenderer`.

Verify the app still works identically after this step before continuing.

---

### Step 3 — Remove author nodes from the data layer

In `useLensStore.js`, `graphData` currently emits author nodes and author→repo edges. Add a
derived `teamGraphData` computed that:

- Replaces author nodes with their owning team node (collapsed) or omits them entirely
  (authors are not shown at any zoom level in the new graph)
- Aggregates edges: all commits by Team A's authors to Repo B become a single `Team A → Repo B`
  edge with summed commit count
- Marks each repo with its owning team id (from `team.repos[]`) for ring and hull logic
- Unowned repos appear as standalone nodes (no hull, no rings)

`graphData` stays untouched so the old renderer still works during transition.

---

### Step 4 — Build the new team↔repo renderer

Create `app/src/composables/graphs/useTeamRepoBipartite.js`, implementing the same interface.

#### 4a — Node types

| Type | Shape | Behaviour |
|------|-------|-----------|
| `team` (collapsed) | Pill / rounded rect | Expands on click; edge anchor |
| `team` (expanded) | Anchor pill at hull centroid | Always present; still the edge source |
| `repo` | Square | Edge target; carries violation ring |

When a team is expanded its repos appear as individual nodes inside its hull. The team anchor
node remains and is the source for all outgoing edges — repo nodes inside the hull are targets
only, never sources.

#### 4b — Hull boundaries

Hulls are always drawn for expanded teams (no toggle). Hull is a convex shape enclosing all
of the team's repo nodes plus the anchor node. A visible hull boundary makes the violation
signal unambiguous: **any edge crossing a hull is a violation**.

In-team edges (Team A → its own repos) are not drawn; they are expected and add no information.

#### 4c — Edges

Edges connect a team node to a repo node it contributed to, where that repo is **not** owned by
that team (cross-team only). Edge weight = commit count. Edges below a configurable noise
threshold (see Step 5) are suppressed entirely.

Direction arrow points from team to repo.

#### 4d — Force layout

Teams occupy a roughly circular outer ring. Repos cluster near their owning team. Expanded
team repos are pulled toward their team anchor by the existing team-gravity force. No radial
force for repos inside an expanded hull — let gravity handle placement.

---

### Step 5 — Violation rings on repo nodes

Each repo node gets a ring overlay computed from `teamGraphData`.

- Ring = donut segments, one arc per contributing outside team
- Arc angle proportional to that team's % of total commits to this repo
- Arc colour = contributing team's colour
- **A ring only appears if at least one outside team exceeds the configurable threshold**
  (threshold = % of commits from a single outside team)
- No teams configured → no rings (ownership is undefined)
- The ring is drawn by `drawOverlays()` — redrawn reactively when the threshold changes,
  with no force simulation restart

Threshold is a single reactive value (default 10%). Changing it calls `drawOverlays()` only.

---

### Step 6 — Threshold UI

Add a threshold control to the existing Visualization panel in `NetworkGraph.vue`:

- Labelled slider: "Violation threshold" — range 1–50%, default 10%
- Live-updates rings as the user drags (no redraw, just `drawOverlays()`)
- Only visible when teams are configured

No other persistence needed; threshold is ephemeral session state like the other viz controls.

---

### Step 7 — Wire new renderer as default

In `NetworkGraph.vue`:

- Replace `useAuthorRepoBipartite` with `useTeamRepoBipartite` as the active renderer
- Pass `teamGraphData` (from Step 3) instead of `graphData`
- Remove the `showAuthors` toggle (no longer meaningful)
- Keep `crossTeamOnly` toggle removal — it is now always implied (only cross-team edges exist)
- Keep `edgeWeight`, `teamBoundary`, physics sliders — all still applicable

The old `useAuthorRepoBipartite` composable stays in the codebase unused, ready for a future
"author explorer" view if needed.

---

### Step 8 — Cleanup

- Remove dead template controls (`showAuthors`, `crossTeamOnly` button)
- Remove `teamBoundary` toggle — hulls are always on in the new renderer; boundary style is
  fixed (clean convex hull, no blur/density options needed at this stage)
- Update the graph header legend (no Author circle entry; add Hull = team boundary entry)
- Update `CLAUDE.md` architecture section to reflect the new graph model

---

## What is explicitly out of scope

- Author drill-down view (postponed)
- Heat map / chord diagram / matrix views (future question-driven views)
- Time-series / trend visualisation
- Grouping multiple repos into a named bounded context
- Multi-team repo ownership (a repo owned by more than one team)
