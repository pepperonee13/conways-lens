# ConwayLens — Feature Overview

A plain-language catalogue of what ConwayLens can do today. For setup and commands
see the [README](../README.md); for internals see [architecture.md](architecture.md).

## Data extraction

- Pull commit history from any number of git repositories (GitHub, Azure DevOps, or any
  git remote) into a single CSV.
- Cross-platform Node.js extractor (clones repositories in parallel) and a PowerShell
  extractor for Windows.
- Limit history to a date range, point the extractor at different repository lists, and
  write separate CSVs per team or environment.

## Loading data

- Drag and drop one or more CSV files onto the app — no upload server needed.
- Merge multiple CSVs into one dataset (duplicate commits are removed automatically and
  the date range expands to cover every file).
- Add more data to an active dataset, or replace it entirely (hold **Shift** while
  dropping to replace).
- Filter the whole analysis to a time window with the date-range controls.

## Teams and ownership

- Create teams with a name and colour, and assign authors and bounded contexts to them.
- Assign by dragging unassigned items onto a team, or with inline "add" pills.
- Everything is configured at runtime in the browser — no config files to edit.

## Bounded contexts

- Group one or more repositories under a single named **bounded context** so ownership is
  expressed in domain terms, not raw repository names.
- A context can include whole repositories, specific sub-paths within a repository, or
  glob patterns — useful when one repo holds several domains, or one domain spans repos.
- Repositories you don't explicitly group still appear automatically, each as its own
  context, so the tool works with zero context configuration.
- Create and edit contexts in the **Contexts** tab, or build one directly from the graph
  by right-clicking a context node (or a folder/file in the drill-down) and choosing
  **Add to bounded context**.

## Author identity

- Merge multiple git identities of the same person (e.g. different name/email spellings)
  into one canonical author by dragging one author onto another.
- Ignore specific authors (bots, automation accounts) to remove them from the analysis.
- Optionally anonymise author names in the display while keeping real names in exports.

## Graph views

- **Swimlane view** — one lane per team, ordered by violation severity, with each team's
  bounded contexts shown alongside. Edges that cross a lane represent cross-team
  contributions.
- **Bubbles view** — a circle-pack layout where each team is a bubble containing its
  contexts, sized by commit volume; expand a team to see its contexts.
- Node and bubble sizes scale with commit volume; hovering any node or edge highlights its
  connections and shows a detailed tooltip with team and author breakdowns.

## Drill-down

- Click a bounded context to open a radial view of all its contributors, grouped by team,
  with each author's share of the commits shown on the edges.
- Drill further into the context's folder structure (when file-path data is available) to
  see ownership directory by directory.

## Cross-team analysis

- Highlights where contributions cross team boundaries — the core signal for Conway's Law.
- Set a **violation threshold** (the minimum outside-team share before something is
  flagged) and optionally hide everything below it.
- A severity ordering surfaces the teams and contexts with the most cross-boundary
  activity first.

## Visualization controls

- Toggle weighted edges (edge width and colour by commit volume and source team).
- Adjust the violation threshold and show/hide non-violating contexts.
- Show or hide the per-context author list in tooltips.
- Reset all visualization settings to their defaults.
- Enter fullscreen for presentations or large datasets.
- Export the current graph view as a PNG (2× resolution for retina displays) or an
  SVG for vector editing — a download button appears in the toolbar when data is loaded.

## Filtering

- Narrow the graph to specific teams, bounded contexts, or authors.
- Search within the filter panel and see how many items are currently selected.
- Clear all filters at once.

## Saving your work

- Team mappings, contexts, aliases, ignored authors, and filters persist automatically in
  your browser.
- Export the full mapping configuration to a JSON file and import it back later or share
  it with teammates.
