# ConwayLens

Validates whether your team structure and code ownership boundaries match real contribution patterns from git history — a lens on [Conway's Law](https://en.wikipedia.org/wiki/Conway%27s_law) in action.

## How it works

1. You define which git repositories to analyse.
2. An extraction script clones them and extracts commit history into a CSV.
3. A Vue SPA visualises cross-team contributions across several graph views.
4. You define teams and assign authors and bounded contexts to them at runtime — no config files to edit.

## Quick start

### 1. Configure repositories

Copy `cli/repos.example.json` to `cli/repos.json` and edit it:

```json
[
  { "name": "my-service", "url": "https://github.com/org/my-service" },
  { "name": "another-repo", "url": "https://dev.azure.com/org/project/_git/another-repo", "branch": "develop" }
]
```

`name` becomes the repository label in the graph. `branch` is optional and defaults to `main`.

By default the script reads `repos.json` from its own directory. Use `-ReposFile` to point it at a different file (useful when managing multiple environment configs).

### 2. Extract git history

**Node.js (cross-platform, parallel — recommended for many repos):**

```bash
node cli/extract-git-history.mjs
# Optional parameters:
node cli/extract-git-history.mjs --since 2024-01-01 --until 2024-12-31
node cli/extract-git-history.mjs --concurrency 8 --workdir /tmp/repos
node cli/extract-git-history.mjs --repos team-a-repos.json --output team-a.csv
```

Clones in parallel (default `--concurrency 4`, no npm dependencies needed). Output defaults to
`frontend/public/CommitHistory-<reposFileName>.csv`, so different team configs produce different files
that can be merged in the frontend (see step 5).

**PowerShell (Windows, sequential):**

```powershell
.\cli\extract-git-history.ps1
.\cli\extract-git-history.ps1 -Since 2024-01-01 -Until 2024-12-31
.\cli\extract-git-history.ps1 -ReposFile C:\projects\my-repos.json
```

Both produce the same CSV schema and metadata footer.

### 3. Start the app

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5174 in your browser.

Drag and drop one or more CSV files into the upload zone. Multiple files are merged into a single
dataset (rows are deduplicated by `Product`+`ChangesetId`+`FilePath`, and the date range is
expanded to cover all inputs). Once data is loaded, use **Add CSV** to merge additional files,
or **Replace** to start over. Drag-and-drop on an active dataset merges by default; hold
<kbd>Shift</kbd> while dropping to replace.

### 4. Define team mappings

Click **Mapping** (bottom right) to open the mapping panel. It has four tabs:

- **Teams** — Add teams (name + colour) and assign authors and bounded contexts. Drag any badge from the *Unassigned* section onto a team card to assign it, or use the inline "+" pills inside a team.
- **Contexts** — Define bounded contexts that group one or more repositories (or sub-paths) under a single name, then add `repo`, `path`, or `glob` sources to them. Any repository you don't place in a context maps to an automatic context named after itself, so this tab is optional.
- **Author Aliases** — Merge multiple git identities of the same person by dragging one author pill onto another. The drop target becomes the canonical name. Pill colours reflect the assigned team.
- **Ignored** — Click an author pill to ignore them (removed from the graph entirely); click again to restore.

You can also build a context straight from the graph: right-click a context node, or a folder/file in the folder drill-down, and choose **Add to bounded context** to send it to the Contexts tab for confirmation.

Mappings persist automatically in your browser's localStorage. Use **Export** to save them as JSON and **Import** to restore.

### 5. Explore the graph

Switch between two layouts with the view toggle in the graph header:

- **Swimlane** (default) — one lane per team, sorted by violation severity, with bounded-context nodes on the right. Edges crossing a lane are cross-team contributions, and contexts with a high outside-team share get a violation ring.
- **Bubbles** — a circle-pack view where each team is a bubble containing its contexts; bubble size scales with commit volume. Click a team to expand it.

Node size scales with commit volume; hover any node or edge to highlight its connections and inspect a detailed tooltip.

The **Visualization** dropdown (graph header) tunes the view: toggle weighted edges, set the **violation threshold** (minimum outside-team % before a ring/edge is flagged), hide non-violating contexts, and show or hide the per-context author list in tooltips.

Use the **Filters** panel to narrow the graph to specific teams, contexts, or authors. The **fullscreen** button maximises the canvas.

**Drill down**: click a bounded context to open a radial detail view of all its contributors, grouped by team, with each author's share of the commits shown on the edges. From there, drill further into the context's folder structure (when file-path data is present) to see ownership at the directory level.

## Output

Both extraction scripts produce a `CommitHistory` CSV with one row per file per commit:

| Column | Description |
|---|---|
| `Date` | Commit date (YYYY-MM-DD) |
| `DateTime` | Full timestamp |
| `Product` | Repository name (from `repos.json`) |
| `Author` | Git author name |
| `ChangesetId` | Commit SHA |
| `ChangeType` | `add`, `edit`, `delete`, `rename` |
| `FilePath` | File path within the repository |
| `Source` | Always `git` |
| `CommitMessage` | Commit subject line |

## Documentation

- [docs/features.md](docs/features.md) — plain-language overview of everything the app can do.
- [docs/architecture.md](docs/architecture.md) — data flow, key source files, and store state shape.

## Contributing

See [docs/architecture.md](docs/architecture.md) for an overview of the data flow, key source files, and store state shape.
