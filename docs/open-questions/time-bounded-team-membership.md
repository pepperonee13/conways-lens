# Time-bounded team membership

**Status:** open / deferred
**Related code:** `app/src/stores/useLensStore.js` (`graphData`, `ownershipGraphData`)

## Problem

Team membership in ConwayLens is currently a flat set: a team has a list of
authors, and an author is "in" a team if their name appears in that list.
Two related issues fall out of this model:

1. **Multi-team authors.** An author legitimately embedded in two teams (e.g.
   a tech lead spanning both owning teams) gets flagged as a cross-team
   violation when contributing to either team's repos, because the membership
   resolver doesn't recognise that *any* of the author's teams owns the
   target repo.
2. **Historical transfers.** When the analysis window spans a reorg, commits
   made *before* an author moved teams are evaluated against their *current*
   team assignment, producing false violations for what was, at the time,
   within-team work.

## Considered solution: date-ranged assignments

Model team membership (and probably repo ownership) as intervals:

```js
team.authors = [{ name, from?, until? }]
team.repos   = [{ id,   from?, until? }]
```

The graph resolver then, for each commit row, asks "which team was this
author in on `row.Date`?" rather than "which team is this author in?"

### Pros

- Conceptually correct — team membership is inherently time-bounded.
- Handles both problems above in one model.
- Maps cleanly to how org charts actually evolve (transfers, splits, merges).

### Cons

- **Data entry burden.** Every assignment becomes a 3-field form with
  overlap validation. For orgs with stable teams this is pure overhead.
- **Repo ownership too.** To be consistent, repo ownership needs the same
  treatment, since ownership transfers happen more often than people moves.
- **Lookup cost.** Hot path in `graphData` becomes an interval lookup per
  commit row instead of a hash lookup. Still cheap but the membership maps
  become interval structures rather than `Set`s.
- **UI surface.** `MappingEditor.vue` grows a timeline picker per
  assignment. JSON import/export schema breaks.

### Possible middle path

Keep `authors: [name]` as the simple case, but allow `authors: [{name, from, until}]`
as an optional richer form — the resolver treats a bare string as "always
a member." Defers complexity to orgs that actually need it.

## Current (sufficient) workaround

Treat an author's team memberships as a `Set<teamId>` and skip an edge
whenever **any** of the author's teams owns the target repo. This handles
genuine multi-team embedding without introducing temporal modelling.

Three call sites in `useLensStore.js` need to change for this:

1. `graphData` collapsed-team loop — short-circuit the row when
   `authorTeams.has(targetTeamId)` instead of skipping only the matching
   per-team edge.
2. `crossTeamOnly` filter — replace
   `[...authorTeams].some(tid => tid !== repoTeamId)` with
   `!authorTeams.has(repoTeamId)`.
3. `ownershipGraphData` — change `authorToTeamId` (first-team-wins) to
   `authorToTeamIds: Set<teamId>`, and skip rows where
   `authorTeamIds.has(owningTeam)`.

Open sub-question for the workaround: when a multi-team author commits,
should the commit count toward **all** of their teams' totals (honest
per-team, double-counts at org level) or be attributed to a single primary
team (clean totals, arbitrary choice)? Only affects sidebar stats; the
violation-edge logic is unambiguous either way.

## Decision

Defer date-ranged assignments until false violations from historical
transfers become a concrete pain point — i.e. when an analysis window
routinely spans a reorg. The multi-team Set workaround covers the
common case.
