# 001 — Conway's Law Violation Graph Redesign

## Context

The current visualization is author-centric: individual contributors are the primary nodes,
with teams as a secondary overlay. This is the wrong lens for the tool's actual purpose.

The tool's job is to give enterprise/area architects a signal: **do team boundaries still match
reality?** The unit of concern is the bounded context (= repository). A bounded context touched
by multiple teams violates the single-mental-model principle. A team working across multiple
bounded contexts it owns is fine.

The redesign makes teams and bounded contexts the primary nodes. Violations become
self-evident from the spatial layout: **any contribution edge that crosses a team's ownership
boundary is a Conway's Law violation**. No legend or threshold needed to read it — the topology
speaks for itself.

Authors are removed from the primary view entirely.

---

## Plan

### Step 1 — Define the visualization interface

Create `app/src/composables/graphs/useGraphRenderer.js` as a documented contract that every
visualization must satisfy:

```js
{
  draw(context),        // initial render; context = { svgRef, dims, data, config }
  updateEdgeStyles(),   // reapply edge colors/widths without full redraw
  updateNodeColors(),   // reapply node fill colors without full redraw
  drawOverlays(),       // redraw ownership boundaries and violation rings
  teardown(),           // stop simulation, remove listeners
}
```

`NetworkGraph.vue` will hold a `currentRenderer` ref and delegate all drawing through this
interface. It never calls D3 directly itself.

---

### Step 2 — Extract the current visualization

Move all drawing logic from `NetworkGraph.vue` into
`app/src/composables/graphs/useAuthorContributionGraph.js`, implementing the interface from
Step 1. No behaviour change — this is a mechanical extraction.

`NetworkGraph.vue` becomes a shell: template, controls, tooltip, resize, watchers, and calls
to `currentRenderer`.

Verify the app still works identically after this step before continuing.

---

### Step 3 — Build the ownership data model

In `useLensStore.js`, `graphData` currently emits individual author nodes and their
contribution edges. Add a derived `ownershipGraphData` computed that:

- Removes authors entirely — they are not shown at any level in the new visualization
- Aggregates contributions: all commits by any member of Team A to Bounded Context B become
  a single `Team A → Bounded Context B` edge with summed commit count
- Marks each bounded context with its owning team (from `team.repos[]`) for boundary and
  violation ring rendering
- Unowned bounded contexts appear as standalone nodes (no ownership boundary, no rings)

`graphData` stays untouched so the existing visualization still works during transition.

---

### Step 4 — Build the Conway's Law violation visualization

Create `app/src/composables/graphs/useConwayGraph.js`, implementing the same interface.

#### 4a — Node types

| Node | Represents | Behaviour |
|------|-----------|-----------|
| Team (collapsed) | A team and all its bounded contexts | Click to expand; contribution source |
| Team anchor (expanded) | The team identity within its ownership boundary | Always present; contribution source |
| Bounded context | A repository / bounded context | Contribution target; carries violation ring |

When a team is expanded, its bounded contexts appear as individual nodes inside its ownership
boundary. The team anchor remains visible and is the source of all outgoing contribution
edges — bounded context nodes are targets only, never sources.

#### 4b — Ownership boundaries

Ownership boundaries are always visible for expanded teams — there is no toggle. The boundary
encloses all of a team's bounded context nodes and the team anchor. This makes violations
unambiguous: **any contribution edge that crosses an ownership boundary is a violation**.

Contribution edges between a team and its own bounded contexts are not drawn — they are
expected and carry no signal.

#### 4c — Contribution edges

An edge is drawn from a team node to a bounded context only when that team contributed to a
bounded context it does not own (outside contributions only). Edge weight reflects commit
volume. Edges below a configurable noise floor are suppressed to avoid one-off commits
creating visual clutter.

Direction arrow points from contributing team to bounded context.

#### 4d — Layout

Teams occupy a roughly circular arrangement. Each team's bounded contexts cluster near their
owning team anchor. When a team is expanded, its bounded contexts are drawn toward the team
anchor so they remain inside the ownership boundary.

---

### Step 5 — Violation rings on bounded context nodes

Each bounded context node gets a ring showing the breakdown of outside contributions.

- One arc segment per outside team that contributed to this bounded context
- Arc size proportional to that team's share of total commits to this bounded context
- Arc colour = contributing team's colour
- **Ring only appears if at least one outside team's contribution exceeds the violation
  threshold** — suppresses noise from negligible one-off contributions
- No teams configured → no rings (ownership is undefined, violations cannot be detected)
- Ring is redrawn reactively when the threshold changes — no layout restart needed

Threshold default: 10%.

---

### Step 6 — Violation threshold control

Add a threshold control to the Visualization panel in `NetworkGraph.vue`:

- Labelled slider: "Violation threshold" — range 1–50%, default 10%
- Adjusting it live-updates violation rings only (no layout change)
- Only visible when teams are configured

Threshold is ephemeral session state — no persistence needed.

---

### Step 7 — Switch to the new visualization

In `NetworkGraph.vue`:

- Replace `useAuthorContributionGraph` with `useConwayGraph` as the active renderer
- Pass `ownershipGraphData` (from Step 3) instead of `graphData`
- Remove the `Show authors` toggle — no longer applicable
- Remove the `Cross-team only` toggle — outside contributions are now the only edges shown
- Retain edge weight, physics sliders — all still applicable

The old `useAuthorContributionGraph` composable stays in the codebase unused, ready for a
future author-level exploration view if needed.

---

### Step 8 — Cleanup

- Remove controls that no longer apply (`Show authors`, `Cross-team only`, `Boundaries` toggle)
- Update the graph header legend: remove Author and Repository entries; add Bounded Context
  and Ownership Boundary entries
- Update `CLAUDE.md` architecture section to reflect the new visualization model

---

## What is explicitly out of scope

- Author drill-down view (postponed)
- Alternative visualizations (heat map, coupling matrix, chord diagram) — future work
- Time-series / trend analysis
- Grouping multiple repositories into a named bounded context
- Shared ownership (a bounded context owned by more than one team)
