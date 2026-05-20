# ConwayLens

Validates whether your team structure and code ownership boundaries match real contribution patterns from git history — a lens on [Conway's Law](https://en.wikipedia.org/wiki/Conway%27s_law) in action.

## How it works

1. You define which git repositories to analyse.
2. A PowerShell script clones them and extracts commit history into a CSV.
3. A Vue SPA visualises cross-team contributions as a force-directed network graph.
4. You define teams and assign authors/repositories to them at runtime — no config files to edit.

## Quick start

### 1. Configure repositories

Edit `analysis/repos.json`:

```json
[
  { "name": "my-service", "url": "https://github.com/org/my-service" },
  { "name": "another-repo", "url": "https://dev.azure.com/org/project/_git/another-repo", "branch": "develop" }
]
```

`name` becomes the repository label in the graph. `branch` is optional and defaults to `main`.

By default the script reads `repos.json` from its own directory. Use `-ReposFile` to point it at a different file (useful when managing multiple environment configs).

### 2. Run the analysis

```powershell
.\analysis\Analyse-Repositories.ps1
# Optional parameters:
.\analysis\Analyse-Repositories.ps1 -Since 2024-01-01 -Until 2024-12-31
.\analysis\Analyse-Repositories.ps1 -WorkDir C:\my-repos
.\analysis\Analyse-Repositories.ps1 -ReposFile C:\projects\my-repos.json
```

This clones or updates each repository and writes `app/public/TimelineData.csv`.

### 3. Start the app

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5174 in your browser.

### 4. Define team mappings

Click **Mapping** (bottom right) to open the mapping panel:

- Add teams and give each a name and colour.
- Assign **authors** (discovered from git log) and **repositories** to each team.
- Changes are saved automatically in your browser's localStorage.
- Use **Export** to save your mappings as JSON and **Import** to restore them.

### 5. Explore the graph

The network graph shows arrows between teams wherever contributors commit to repositories they don't own. Arrow width indicates commit volume; badge numbers show contributor count.

Use the **Filters** panel (bottom left) to narrow by date range, repository, author, or team. Click a team node to drill down into the individual repositories receiving cross-team contributions.

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
