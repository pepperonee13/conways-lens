# Architecture

## Data flow

```
repos.json (copy of repos.example.json) → extract-git-history (.mjs / .ps1) → CommitHistory.csv
                                                ↓
                                    (user uploads via drag-drop)
                                                ↓
                                    useLensStore (Pinia)
                                      ├─ commits (raw CSV rows)
                                      ├─ contexts (user-defined bounded contexts)
                                      ├─ allContexts (user + auto 1:1 contexts)
                                      ├─ teams (own contexts, not raw repos)
                                      ├─ graphData / ownershipGraphData (deduped edges + nodes)
                                      └─ crossTeamOnly (filter flag)
                                                ↓
                                    NetworkGraph.vue (D3 visualisations)
```

## Bounded contexts

A **bounded context** is the first-class unit of ownership in the graph — it sits
*above* repositories. A context groups one or more repository sources under a single
named identity, so a team owns contexts rather than raw repo names.

```js
// BoundedContext
{
  id:   string,
  name: string,
  sources: Array<
    | { type: 'repo', repo: string }                 // a whole repository
    | { type: 'path', repo: string, path: string }   // a path prefix within a repo
    | { type: 'glob', repo: string, pattern: string } // a glob within a repo
  >
}
```

**Auto-contexts.** Every repository that isn't already wholly covered by a
user-defined `repo` source gets an automatic 1:1 context whose `id` *equals the
repo name*. This is why `teams[].contexts` can hold a bare repo name and still
resolve — auto-contexts mean the graph works with zero configuration, and
user-defined contexts are purely additive on top.

**Resolution.** `resolveContextId(repoId, filePath)` maps each CSV row to exactly
one context. User-defined sources are matched first, most-specific-wins
(longest matching `path`/`pattern` beats a whole-`repo` match); if nothing
matches, the row falls back to the auto-context (`id === repoId`). `globToRegex`
compiles glob patterns (`*`, `**`, `?`) to anchored regexes for matching.

**Managing contexts.** Contexts are created and edited in the **Contexts** tab of
the MappingEditor (`addContext` / `updateContext` / `removeContext` /
`addContextSource` / `removeContextSource`). They can also be seeded from the
graph: right-clicking a context node (whole repo) or a folder/file node in the
drill-down opens an "Add to bounded context" menu. Confirming records the source
via `beginAddToContext`, which the MappingEditor watches to open the Contexts tab
with the source pre-filled for confirmation.

## Key files

- **`frontend/src/stores/useLensStore.js`** — Central Pinia store. Parses CSV with PapaParse (including metadata footer `Since=...,Until=...`), owns bounded contexts, teams, author normalizations, ignored authors, filters, and the `crossTeamOnly` flag. `graphData` (author/team → context, with collapsible teams) and `ownershipGraphData` (team-level, circle-pack) are computed from this state. Teams, contexts, normalizations, ignored authors, and filters persist to localStorage automatically.
- **`frontend/src/components/NetworkGraph.vue`** — Hosts the D3 visualisations and the shared tooltip + node context menu. Delegates rendering to view-specific composables in `composables/graphs/` (swimlane, circle-pack, repo-detail radial, folder drill-down). Contributions flow from authors/teams (sources) to **contexts** (targets).
- **`frontend/src/components/MappingEditor.vue`** — Floating panel with tabs: **Teams** (assign authors + contexts), **Contexts** (define bounded contexts and their sources), **Author Aliases** (merge git identities), **Ignored**. Supports JSON import/export.
- **`frontend/src/components/FilterPanel.vue`** — Team / context / author filtering, with selection counts.
- **`frontend/src/views/LensView.vue`** — Root layout; handles CSV file upload/drag-drop.
- **`frontend/src/composables/useAnonymize.js`** — Maps real author names to stable fake names for display, gated by the `ANONYMIZE_AUTHORS` config flag. Display-only; store data and JSON export always use real names.

## Store state shape

```js
commits         // Raw parsed CSV rows
contexts             // BoundedContext[] — user-defined only (auto-contexts derived in allContexts)
teams                // { id, name, color, authors[], contexts[] }  ← contexts[] holds context IDs
authorNormalizations // { "raw git name" → "canonical name" }
ignoredAuthors       // string[] — excluded from graphData entirely
crossTeamOnly        // boolean — when true, graphData only contains cross-team edges
```

`allContexts` = user-defined `contexts` merged with auto 1:1 contexts for any
uncovered repo. `graphData` and `ownershipGraphData` are computed from all of the
above and emit `type: 'context'` target nodes. `nodeColors` maps `"type:id"` keys
(e.g. `context:<id>`, `author:<name>`) to team hex colors.

## Mappings import/export

`exportMappings` writes a **v3** JSON document: `{ version: 3, contexts, teams,
authorNormalizations, ignoredAuthors }`, where each team references contexts via a
`contexts: [contextId, ...]` array. `importMappings` reads this shape directly;
files without a top-level `contexts` array still work via auto-contexts.

## Styling

- Tailwind CSS utility-first; custom brand colors defined in `tailwind.config.js` and as CSS variables in `frontend/src/variables.css`.
- Brand palette: blue `#225EA9`, teal `#088F9B`, orange `#F08223`, gray `#2F3944`.
- Fonts: Inter (UI), JetBrains Mono (data/code display).
- Floating panels use a backdrop overlay and slide-in transition.
```
