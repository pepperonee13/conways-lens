# ConwayLens

Validates whether your team structure and code ownership boundaries match real contribution patterns from git history — a lens on [Conway's Law](https://en.wikipedia.org/wiki/Conway%27s_law) in action.

## How it works

1. You define which git repositories to analyse.
2. A PowerShell script clones them and extracts commit history into a CSV.
3. A Vue SPA visualises cross-team contributions as a force-directed network graph.
4. You define teams and assign authors/repositories to them at runtime — no config files to edit.

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
`frontend/public/TimelineData-<reposFileName>.csv`, so different team configs produce different files
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

Click **Mapping** (bottom right) to open the mapping panel. It has three tabs:

- **Teams** — Add teams (name + colour) and assign authors and repositories. Drag any badge from the *Unassigned* section onto a team card to assign it, or use the inline "+" pills inside a team.
- **Author Aliases** — Merge multiple git identities of the same person by dragging one author pill onto another. The drop target becomes the canonical name. Pill colours reflect the assigned team.
- **Ignored** — Click an author pill to ignore them (removed from the graph entirely); click again to restore.

Mappings persist automatically in your browser's localStorage. Use **Export** to save them as JSON and **Import** to restore.

### 5. Explore the graph

The main view is a force-directed graph that groups contributors and repositories by team. Node size scales with commit volume; hover any node or edge to highlight its connections.

When teams are configured, each team's nodes are enclosed in a colour-coded hull so boundaries are immediately visible, and nodes cluster toward their team's centre of gravity.

Toggle **Cross-team only** (in the graph header) to filter the graph down to just the edges where the author's team differs from the repository's team — the exact signal Conway's Law predicts.

**Drill down**: click a repository to open a radial detail view of all its contributors, grouped by team. Edge percentages (each author's share of the repo's commits) are shown directly on the edges.

## Output

The PowerShell script produces `TimelineData.csv` with one row per file per commit:

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

## Contributing

See [docs/architecture.md](docs/architecture.md) for an overview of the data flow, key source files, and store state shape.
