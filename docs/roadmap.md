# ConwayLens — Feature Roadmap

Ideas for future development, roughly ordered by value. The app is feature-complete
for its core use-case; everything below extends it.

---

## High value / natural extensions

### 1. Git blame heatmap
Show *which files* are hotspots of cross-team contributions, not just which teams.
A treemap or table view ranked by violation share would let engineering managers
pinpoint exactly which modules need ownership clarity.

### 2. Timeline / trend view
Animate or scrub the graph through time (e.g. per sprint or per month) so teams can
see whether Conway violations are getting better or worse over a release cycle.
The date-range infrastructure already exists; this would add a playback control.

### 3. Direct VCS integration
Skip the CSV extraction step entirely. Pull commit history via a PAT token from
GitHub, GitLab, or Azure DevOps directly in the browser (or a thin server proxy).
The Node.js extractor already shows the shape of the data needed.

### 4. Team health score
A single aggregated metric per team and per bounded context (e.g. "Team A owns 82 %
of their code") that can be exported as a shareable PDF or CSV report — useful for
architecture reviews and quarterly planning.

### 5. Configurable alerts / threshold presets
Let users save named threshold presets ("strict", "lenient") and flag contexts that
breach them. A shareable URL that encodes the current view state would complement
this for async reviews.

### 5b. Dynamic context canvas
An open canvas where a user can pull specific bounded contexts onto a freeform workspace and arrange them side by side. Each context tile shows its author radial or folder view inline, so an architect can compose a custom picture — "show me Auth, Payments, and the API Gateway together" — without being constrained by the full team graph. Tiles could be linked with arrows to annotate intended vs. actual dependencies. The canvas state would be saveable as a named lens (see item 6).

---

## Lower-hanging fruit

### 6. Named lenses (client / project profiles)
Save the complete configuration — teams, bounded contexts, author aliases, ignored
authors, and active visualisation settings — under a named lens. The name is a
natural fit: each client or project gets its own lens on its codebase. A lens
picker in the toolbar lets consultants or architects switch between client projects
instantly without exporting and re-importing JSON. Lenses are stored in
`localStorage` alongside the current data, so no backend is required; individual
lenses can still be exported as JSON for sharing or backup.

### 10. Bipartite source view for multi-source contexts
When drilling into a context that has more than one source (repo, path, or glob), show a
bipartite layout — authors/teams on the left, source nodes on the right — instead of a
single centre node. Edges reveal which authors worked in which source, making cross-source
contributors immediately visible as knowledge hubs or hidden coupling points. Clicking a
source node on the right then enters the existing folder drill-down for that source.
The infrastructure is already in place (`sourceContributorsData`, `useRepoFolderGraph`,
`useContextAuthorGraph`); this is primarily a layout change to `useContextAuthorGraph` and
a new entry point in the detail panel header.

### 7. Dark mode
Tailwind already supports `dark:` variants throughout the codebase. Wire up a toggle
and map the brand palette to dark equivalents.

### 8. Keyboard shortcuts
Navigate between views (swimlane ↔ bubbles), reset filters, open/close fullscreen,
and drill in/out without touching the mouse. A `?` overlay to list shortcuts.

### 9. Shareable URL state
Encode the current filters, view mode, date range, and violation threshold in the
URL hash so a link can be shared with colleagues who have the same dataset loaded.

---

## Notes

- Shipped items are removed from this list and documented in [features.md](features.md).
- Items 1–5 would benefit from a lightweight backend; items 6–9 are fully
  achievable in the existing browser-only architecture.
- The extraction CLI (Node.js + PowerShell) is intentionally kept dependency-free;
  any server component should follow the same principle where possible.
