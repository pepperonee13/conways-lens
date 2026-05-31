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

---

## Lower-hanging fruit

### 6. Dark mode
Tailwind already supports `dark:` variants throughout the codebase. Wire up a toggle
and map the brand palette to dark equivalents.

### 7. Keyboard shortcuts
Navigate between views (swimlane ↔ bubbles), reset filters, open/close fullscreen,
and drill in/out without touching the mouse. A `?` overlay to list shortcuts.

### 8. Export as PNG / SVG ✅ *(shipped)*
Save the current graph view for presentations. PNG at 2× resolution for retina
displays; SVG for vector editing. Download button appears in the toolbar when data
is loaded.

### 9. Shareable URL state
Encode the current filters, view mode, date range, and violation threshold in the
URL hash so a link can be shared with colleagues who have the same dataset loaded.

---

## Notes

- Items 1–5 would benefit from a lightweight backend; items 6–9 are fully
  achievable in the existing browser-only architecture.
- The extraction CLI (Node.js + PowerShell) is intentionally kept dependency-free;
  any server component should follow the same principle where possible.
