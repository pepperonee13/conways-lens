import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { sameSource, globToRegex, sourcesOverlap, contextForSource as contextForSourceFn, resolveContextId as resolveContextIdFn, matchesSource, sourceKey, sourceLabel, decodeSourceKey } from '../domain/contextSources.js';
import { mergeCommits, mergeDateRanges } from '../domain/commits.js';
import { parseCSVText } from '../adapters/csv.js';
import { generateSimulatedData } from '../simulation/simulated.js';
import { DEFAULT_VIOLATION_THRESHOLD, DEFAULT_DISPLAY_AUTHORS } from '../config.js';

const STORAGE = {
  teams:            'conwaylens:teams',
  normalizations:   'conwaylens:normalizations',
  ignoredAuthors:   'conwaylens:ignoredAuthors',
  contexts:         'conwaylens:contexts',
  filterTeamIds:    'conwaylens:filterTeamIds',
  filterContextIds: 'conwaylens:filterContextIds',
  filterAuthorIds:  'conwaylens:filterAuthorIds',
  vizSettings:      'conwaylens:vizSettings',
  lenses:           'conwaylens:lenses',
  activeLensId:     'conwaylens:activeLensId',
  mappingOpened:    'conwaylens:mappingOpened',
};

const VIZ_DEFAULTS = {
  graphView:          'swimlane',
  edgeWeight:         true,
  violationThreshold: DEFAULT_VIOLATION_THRESHOLD,
  violatingOnly:      true,
  displayAuthors:     DEFAULT_DISPLAY_AUTHORS,
};

const DEFAULT_COLORS  = ['#225EA9', '#088F9B', '#F08223', '#5A4A80', '#C45E0F', '#006B75', '#3A75BA', '#1A9FA9'];
const UNASSIGNED_ID   = '__unassigned__';


function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// Convert a glob pattern to a RegExp.

export const useLensStore = defineStore('lens', () => {
  const commits = ref([]);
  const dataLoaded   = ref(false);
  const dataError    = ref(null);
  const dateInfo     = ref(null);

  const teams                = ref(load(STORAGE.teams, []).map(t => ({ authors: [], contexts: [], ...t })));
  const authorNormalizations = ref(load(STORAGE.normalizations, {}));
  const ignoredAuthors       = ref(load(STORAGE.ignoredAuthors, []));

  // BoundedContext[] — user-defined contexts. Auto-contexts are derived in allContexts.
  // Shape: { id: string, name: string, sources: Array<
  //   | { type: 'repo',  repo: string }
  //   | { type: 'path',  repo: string, path: string }
  //   | { type: 'glob',  repo: string, pattern: string }
  // > }
  const contexts = ref(load(STORAGE.contexts, []));

  watch(teams,                v => localStorage.setItem(STORAGE.teams,         JSON.stringify(v)), { deep: true });
  watch(authorNormalizations, v => localStorage.setItem(STORAGE.normalizations, JSON.stringify(v)), { deep: true });
  watch(ignoredAuthors,       v => localStorage.setItem(STORAGE.ignoredAuthors,  JSON.stringify(v)), { deep: true });
  watch(contexts,             v => localStorage.setItem(STORAGE.contexts,        JSON.stringify(v)), { deep: true });

  const vizSettings = ref(load(STORAGE.vizSettings, { ...VIZ_DEFAULTS }));
  watch(vizSettings, v => localStorage.setItem(STORAGE.vizSettings, JSON.stringify(v)), { deep: true });

  const lenses       = ref(load(STORAGE.lenses, []));
  const activeLensId = ref(load(STORAGE.activeLensId, null) || null);
  watch(lenses,       v => localStorage.setItem(STORAGE.lenses, JSON.stringify(v)));
  watch(activeLensId, v => localStorage.setItem(STORAGE.activeLensId, JSON.stringify(v)));

  const uiLensOpen = ref(false);

  const mappingEverOpened   = ref(load(STORAGE.mappingOpened, false));
  const spotlightDismissed  = ref(false); // session-only, not persisted
  watch(mappingEverOpened, v => localStorage.setItem(STORAGE.mappingOpened, JSON.stringify(v)));
  function markMappingOpened()  { mappingEverOpened.value  = true; }
  function dismissSpotlight()   { spotlightDismissed.value = true; }
  const showMappingSpotlight = computed(() =>
    dataLoaded.value && teams.value.length === 0 && !mappingEverOpened.value && !spotlightDismissed.value
  );

  const activeRange = ref({ since: null, until: null });

  // Drill-down expansion state
  const expandedTeams = ref(new Set()); // Set<teamId> — teams expanded to show their context/author nodes

  async function parseFile(file) {
    const text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
    return parseCSVText(text);
  }

  async function loadCommits(fileOrFiles, { append = false } = {}) {
    dataError.value = null;
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    if (files.length === 0) return;
    try {
      const parsed     = await Promise.all(files.map(parseFile));
      const newCommits = parsed.flatMap(p => p.commits);
      const newRanges  = parsed.map(p => p.dateRange).filter(Boolean);

      if (append && dataLoaded.value) {
        commits.value = mergeCommits(commits.value, newCommits);
        dateInfo.value     = mergeDateRanges([dateInfo.value, ...newRanges]);
      } else {
        commits.value = mergeCommits([], newCommits);
        dateInfo.value     = mergeDateRanges(newRanges);
      }

      dataLoaded.value    = true;
      activeRange.value   = { since: null, until: null };
      expandedTeams.value = new Set();
    } catch (err) {
      dataError.value  = err.message;
      if (!append) dataLoaded.value = false;
    }
  }

  function normalizeAuthor(name) { return authorNormalizations.value[name] ?? name; }

  const allRawAuthors = computed(() =>
    [...new Set(commits.value.map(r => r.author))].sort()
  );
  const allAuthors = computed(() =>
    [...new Set(allRawAuthors.value.map(normalizeAuthor))].sort()
  );
  const allRepos = computed(() =>
    [...new Set(commits.value.map(r => r.repo))].filter(Boolean).sort()
  );

  // Merge user-defined contexts with auto-generated 1:1 contexts for repos not
  // wholly covered by a user context. Auto-contexts use id === repoName so that
  // team.contexts arrays holding a bare repo name still resolve to a context.
  const allContexts = computed(() => {
    const wholeRepoCovered = new Set();
    for (const ctx of contexts.value) {
      for (const src of (ctx.sources ?? [])) {
        if (src.type === 'repo') wholeRepoCovered.add(src.repo);
      }
    }
    const auto = allRepos.value
      .filter(r => !wholeRepoCovered.has(r))
      .map(r => ({ id: r, name: r, sources: [{ type: 'repo', repo: r }] }));
    return [...contexts.value, ...auto];
  });

  // Resolve which context a (repoId, filePath) row belongs to.
  // Checks user-defined contexts first; falls back to the auto-context (id = repoId).
  function resolveContextId(repoId, filePath) {
    return resolveContextIdFn(repoId, filePath, contexts.value) ?? repoId;
  }

  const ignoredSet = computed(() => new Set(ignoredAuthors.value));

  const dateBounds = computed(() => {
    let min = null, max = null;
    for (const row of commits.value) {
      if (!row.date) continue;
      if (!min || row.date < min) min = row.date;
      if (!max || row.date > max) max = row.date;
    }
    return min ? { since: min, until: max } : null;
  });

  const crossTeamOnly     = ref(false);
  const filterTeamIds     = ref(new Set(load(STORAGE.filterTeamIds,     [])));
  // Load from new key; fall back to old filterRepoIds key for existing users.
  const filterContextIds  = ref(new Set(
    load(STORAGE.filterContextIds, null) ?? load('conwaylens:filterRepoIds', [])
  ));
  const filterAuthorIds   = ref(new Set(load(STORAGE.filterAuthorIds,   [])));
  watch(filterTeamIds,    v => localStorage.setItem(STORAGE.filterTeamIds,    JSON.stringify([...v])));
  watch(filterContextIds, v => localStorage.setItem(STORAGE.filterContextIds, JSON.stringify([...v])));
  watch(filterAuthorIds,  v => localStorage.setItem(STORAGE.filterAuthorIds,  JSON.stringify([...v])));

  // Virtual team for authors and contexts not yet assigned to any real team.
  // Exists whenever data is loaded and there are free authors or contexts —
  // including when no real teams have been configured yet.
  const syntheticTeam = computed(() => {
    if (!dataLoaded.value) return null;
    const assignedAuthors     = new Set(teams.value.flatMap(t => t.authors ?? []));
    const assignedContextIds  = new Set(teams.value.flatMap(t => t.contexts ?? []));
    const freeAuthors   = allAuthors.value.filter(a => !assignedAuthors.has(a) && !ignoredSet.value.has(a));
    const freeContextIds = allContexts.value
      .filter(c => !assignedContextIds.has(c.id))
      .map(c => c.id);
    if (freeAuthors.length === 0 && freeContextIds.length === 0) return null;
    return {
      id: UNASSIGNED_ID, name: 'Unassigned Contributors', color: '#9CA3AF',
      authors: freeAuthors, contexts: freeContextIds, isSynthetic: true,
    };
  });

  const graphData = computed(() => {
    const since = activeRange.value.since;
    const until = activeRange.value.until;

    // Merge real teams with the synthetic "Unassigned Contributors" team so all
    // unassigned authors/contexts are treated identically to real-team members.
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;
    const hasTeamSetup = allTeams.length > 0;

    // Build team membership lookups (synthetic team members included).
    // teams[].contexts holds context IDs; auto-context IDs equal repo names.
    const authorToTeams  = {}; // normalizedAuthor → Set<teamId>
    const contextToTeam  = {}; // contextId → teamId

    if (hasTeamSetup) {
      for (const t of allTeams) {
        for (const a of (t.authors ?? [])) {
          if (!authorToTeams[a]) authorToTeams[a] = new Set();
          authorToTeams[a].add(t.id);
        }
        for (const cid of (t.contexts ?? [])) contextToTeam[cid] = t.id;
      }
    }

    // Pre-pass: count total unique commit SHAs per team (includes within-team work).
    const teamTotalShas = {};
    if (hasTeamSetup) {
      for (const row of commits.value) {
        if (!row.author || !row.repo || !row.commitHash) continue;
        if (since && row.date < since) continue;
        if (until && row.date > until) continue;
        const author = normalizeAuthor(row.author);
        if (ignoredSet.value.has(author)) continue;
        for (const tid of (authorToTeams[author] ?? new Set())) {
          (teamTotalShas[tid] ??= new Set()).add(row.commitHash);
        }
      }
    }

    // Accumulate edges: `source|||target` → Set<commitSHA>
    const edgeMap        = {};
    const sourceTypes    = {}; // id → 'author' | 'team'
    const targetIsContext = new Set(); // ids that appear as context targets

    function addEdge(source, target, sha) {
      const key = `${source}|||${target}`;
      (edgeMap[key] ??= new Set()).add(sha);
    }

    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;
      const author = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;

      const contextId = resolveContextId(row.repo, row.filePath);

      // Resolve target: collapsed team node or plain context
      let targetId = contextId;
      if (hasTeamSetup) {
        const contextTeamId = contextToTeam[contextId];
        if (contextTeamId && !expandedTeams.value.has(contextTeamId)) {
          targetId = `team:${contextTeamId}`;
        }
      }

      if (!targetId.startsWith('team:')) {
        targetIsContext.add(targetId);
      }

      if (!hasTeamSetup) {
        addEdge(author, targetId, row.commitHash);
        sourceTypes[author] = 'author';
      } else {
        const authorTeams   = authorToTeams[author] ?? new Set();
        const contextTeamId = contextToTeam[contextId];

        if (authorTeams.size === 0) {
          // Unassigned author — individual node, direct edge to target
          addEdge(author, targetId, row.commitHash);
          sourceTypes[author] = 'author';
        } else {
          for (const authorTeamId of authorTeams) {
            if (expandedTeams.value.has(authorTeamId)) {
              // Author's team is expanded — show as individual node
              addEdge(author, targetId, row.commitHash);
              sourceTypes[author] = 'author';
            } else {
              // Author's team is collapsed — source is the team node.
              // Skip within-team contributions (author team === context team, both collapsed).
              const targetTeamId = targetId.startsWith('team:') ? targetId.slice(5) : contextTeamId;
              if (authorTeamId === targetTeamId) continue;

              const sourceId = `team:${authorTeamId}`;
              addEdge(sourceId, targetId, row.commitHash);
              sourceTypes[sourceId] = 'team';
            }
          }
        }
      }
    }

    let links = Object.entries(edgeMap).map(([key, shas]) => {
      const sep = key.indexOf('|||');
      return { source: key.slice(0, sep), target: key.slice(sep + 3), commits: shas.size };
    });

    // Apply crossTeamOnly filter
    if (crossTeamOnly.value && hasTeamSetup) {
      links = links.filter(l => {
        const src = l.source, tgt = l.target;

        // team → team: always cross-team (self-loops already excluded above)
        if (src.startsWith('team:') || tgt.startsWith('team:')) return true;

        // individual author → context
        const authorTeams   = authorToTeams[src] ?? new Set();
        const contextTeamId = contextToTeam[tgt];
        if (!contextTeamId) return true;
        if (authorTeams.size === 0) return true;
        return [...authorTeams].some(tid => tid !== contextTeamId);
      });
    }

    // Build node list from all IDs referenced in the final link set
    const commitsByNode = {};
    for (const l of links) {
      commitsByNode[l.source] = (commitsByNode[l.source] ?? 0) + l.commits;
      commitsByNode[l.target] = (commitsByNode[l.target] ?? 0) + l.commits;
    }

    // Guarantee every collapsed team node appears in the graph, sized by its total
    // commit activity. Without this, teams with no cross-team edges are invisible.
    if (hasTeamSetup) {
      for (const t of allTeams) {
        if (!expandedTeams.value.has(t.id)) {
          const nodeId = `team:${t.id}`;
          const total = teamTotalShas[t.id]?.size ?? 0;
          if (total > 0) commitsByNode[nodeId] = total;
        }
      }
    }

    const nodes = Object.entries(commitsByNode).map(([id, commits]) => {
      if (id.startsWith('team:')) {
        const teamId = id.slice(5);
        const team   = syntheticT?.id === teamId ? syntheticT : teams.value.find(t => t.id === teamId);
        return {
          id, type: 'team', teamId,
          name:        team?.name  ?? teamId,
          color:       team?.color ?? DEFAULT_COLORS[0],
          contextCount: (team?.contexts ?? []).length,
          authorCount: (team?.authors  ?? []).length,
          commits,
        };
      }
      // Author or context — authors appear only as sources, contexts only as targets
      const type = targetIsContext.has(id) ? 'context' : (sourceTypes[id] === 'team' ? 'team' : 'author');
      return { id, type, commits };
    });

    return { nodes, links };
  });

  // ── Ownership graph data ─────────────────────────────────────────────────────
  // Team-level cross-boundary view. Authors are never nodes — only teams and contexts.
  // Every edge source is a team node; edges only cross team boundaries.
  const ownershipGraphData = computed(() => {
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : [...teams.value];
    if (allTeams.length === 0) return { nodes: [], links: [] };

    const since = activeRange.value.since;
    const until = activeRange.value.until;

    // Build membership lookups
    const authorToTeamId  = {}; // normalizedAuthor → teamId (first assignment wins)
    const contextToTeamId = {}; // contextId → teamId

    for (const t of allTeams) {
      for (const a of (t.authors ?? [])) {
        if (!(a in authorToTeamId)) authorToTeamId[a] = t.id;
      }
      for (const cid of (t.contexts ?? [])) contextToTeamId[cid] = t.id;
    }

    // edge accumulation: `srcTeamId\x00targetContextId` → Set<sha>
    const edgeMap = {};

    // Per-team total commit counting (for node sizing)
    const teamTotalCommits = {};
    const teamTotalShas    = {};
    const teamAuthorShas   = {};

    // Per-context commit counting
    const contextTotalShas   = {};
    const contextContribShas = {};
    const contextAuthorShas  = {};

    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;

      const author    = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;

      const contextId  = resolveContextId(row.repo, row.filePath);
      const authorTeam = authorToTeamId[author];
      const owningTeam = contextToTeamId[contextId];
      const sha        = row.commitHash;

      // Accumulate total commits per team (author's team)
      if (authorTeam) {
        (teamTotalShas[authorTeam] ??= new Set()).add(sha);
        (teamAuthorShas[`${authorTeam}\x00${author}`] ??= new Set()).add(sha);
      }

      // Accumulate per-context totals and per-(context, team) contributions
      (contextTotalShas[contextId] ??= new Set()).add(sha);
      (contextAuthorShas[`${contextId}\x00${author}`] ??= new Set()).add(sha);
      if (authorTeam) {
        (contextContribShas[`${contextId}\x00${authorTeam}`] ??= new Set()).add(sha);
      }

      // Only cross-team edges: author team must differ from owning team
      if (!authorTeam) continue;
      if (authorTeam === owningTeam) continue;

      const key = `${authorTeam}\x00${contextId}`;
      (edgeMap[key] ??= new Set()).add(sha);
    }

    // Convert teamTotalShas → counts
    for (const tid in teamTotalShas) {
      teamTotalCommits[tid] = teamTotalShas[tid].size;
    }

    // Build links
    const links = Object.entries(edgeMap).map(([key, shas]) => {
      const sep    = key.indexOf('\x00');
      const srcTid = key.slice(0, sep);
      const tgt    = key.slice(sep + 1);
      return { source: `team:${srcTid}`, target: tgt, commits: shas.size };
    });

    // Build nodes
    const teamNodes = allTeams.map(t => {
      const totalCommits = teamTotalCommits[t.id] ?? 0;
      const teamPrefix = `${t.id}\x00`;
      const authorContributions = [];
      for (const key in teamAuthorShas) {
        if (!key.startsWith(teamPrefix)) continue;
        const author = key.slice(teamPrefix.length);
        const cnt    = teamAuthorShas[key].size;
        const pct    = totalCommits ? ((cnt / totalCommits) * 100).toFixed(1).replace(/\.0$/, '') : '0';
        authorContributions.push({ authorId: author, commits: cnt, pct, teamColor: t.color });
      }
      authorContributions.sort((a, b) => b.commits - a.commits);
      return {
        id:         `team:${t.id}`,
        type:       'team',
        teamId:     t.id,
        name:       t.name,
        color:      t.color,
        commits:    totalCommits,
        contextCount: (t.contexts ?? []).length,
        authorCount:(t.authors  ?? []).length,
        authorContributions,
      };
    });

    // Context nodes: every context that has commits in range.
    const contextNodeIds = new Set(Object.keys(contextTotalShas));

    const contextNodes = [...contextNodeIds].map(contextId => {
      const owningTeamId = contextToTeamId[contextId] ?? null;
      const owningTeam   = owningTeamId ? allTeams.find(t => t.id === owningTeamId) : null;
      const totalCommits = contextTotalShas[contextId]?.size ?? 0;

      // Build contributions array sorted desc by commits
      const contributions = [];
      for (const t of allTeams) {
        const cnt = contextContribShas[`${contextId}\x00${t.id}`]?.size ?? 0;
        if (cnt > 0) contributions.push({ teamId: t.id, teamColor: t.color, commits: cnt });
      }
      contributions.sort((a, b) => b.commits - a.commits);

      const authorContributions = [];
      const ctxPrefix = `${contextId}\x00`;
      for (const key in contextAuthorShas) {
        if (!key.startsWith(ctxPrefix)) continue;
        const author    = key.slice(ctxPrefix.length);
        const cnt       = contextAuthorShas[key].size;
        const pct       = totalCommits ? ((cnt / totalCommits) * 100).toFixed(1).replace(/\.0$/, '') : '0';
        const teamId    = authorToTeamId[author] ?? null;
        const teamColor = teamId ? (allTeams.find(t => t.id === teamId)?.color ?? '#9CA3AF') : '#9CA3AF';
        authorContributions.push({ authorId: author, commits: cnt, pct, teamColor, teamId });
      }
      authorContributions.sort((a, b) => b.commits - a.commits);

      // Resolve context display name from allContexts
      const ctxDef = allContexts.value.find(c => c.id === contextId);

      return {
        id:           contextId,
        type:         'context',
        name:         ctxDef?.name ?? contextId,
        owningTeamId,
        color:        owningTeam?.color ?? '#9CA3AF',
        commits:      totalCommits,
        contributions,
        authorContributions,
      };
    });

    // Apply filter: contexts visible if owned by a selected team, explicitly
    // selected, or touched by a selected author.
    const hasFilter = filterTeamIds.value.size > 0
                   || filterContextIds.value.size > 0
                   || filterAuthorIds.value.size  > 0;
    let visibleContextNodes = contextNodes;
    let visibleLinks        = links;
    if (hasFilter) {
      visibleContextNodes = contextNodes.filter(node => {
        if (filterContextIds.value.has(node.id)) return true;
        const owner = node.owningTeamId ?? UNASSIGNED_ID;
        if (filterTeamIds.value.has(owner)) return true;
        for (const aid of filterAuthorIds.value) {
          if ((contextAuthorShas[`${node.id}\x00${aid}`]?.size ?? 0) > 0) return true;
        }
        return false;
      });
      const visibleContextSet = new Set(visibleContextNodes.map(n => n.id));
      visibleLinks = links.filter(l => visibleContextSet.has(l.target));
    }

    return { nodes: [...teamNodes, ...visibleContextNodes], links: visibleLinks };
  });

  // Lookup map: `context:${id}` or `author:${id}` → team hex color
  const nodeColors = computed(() => {
    const map = {};
    teams.value.forEach((t, i) => {
      const color = t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      for (const a of (t.authors ?? [])) map[`author:${a}`]   = color;
      for (const cid of (t.contexts ?? [])) map[`context:${cid}`] = color;
    });
    return map;
  });

  function getNodeColor(id, type) {
    // Drill-down composables still use 'repo' type; resolve to 'context' for color lookup.
    const lookupType = type === 'repo' ? 'context' : type;
    return nodeColors.value[`${lookupType}:${id}`] ?? '#9CA3AF';
  }

  // Drill-down actions

  function toggleTeamExpansion(teamId) {
    const next = new Set(expandedTeams.value);
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    expandedTeams.value = next;
  }

  // Team CRUD
  function nextTeamDefaults() {
    return {
      name:  `Team ${teams.value.length + 1}`,
      color: DEFAULT_COLORS[teams.value.length % DEFAULT_COLORS.length],
    };
  }
  function addTeam({ name, color, authors = [], contexts = [] } = {}) {
    const defaults = nextTeamDefaults();
    teams.value.push({
      id:      Date.now().toString(),
      name:    name ?? defaults.name,
      color:   color ?? defaults.color,
      authors,
      contexts,
    });
  }
  function removeTeam(id) { teams.value = teams.value.filter(t => t.id !== id); }

  function* repoPaths(repo) {
    const seen = new Set();
    for (const row of commits.value) {
      if (row.repo === repo && row.filePath && !seen.has(row.filePath)) {
        seen.add(row.filePath);
        yield row.filePath;
      }
    }
  }

  function contextForSource(source) {
    return contextForSourceFn(source, contexts.value, repoPaths);
  }

  // Context CRUD
  function addContext(name, sources = []) {
    const id = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const uniqueSources = sources.filter(s => !contextForSource(s));
    contexts.value = [...contexts.value, { id, name, sources: uniqueSources }];
    return id;
  }
  function removeContext(id) {
    contexts.value = contexts.value.filter(c => c.id !== id);
    // Un-assign the deleted context from all teams
    for (const t of teams.value) {
      t.contexts = (t.contexts ?? []).filter(cid => cid !== id);
    }
  }
  function updateContext(id, patch) {
    contexts.value = contexts.value.map(c => c.id === id ? { ...c, ...patch } : c);
  }
  // Append a source to a context. Rejects if the source is already owned by any context.
  function addContextSource(id, source) {
    const ctx = contexts.value.find(c => c.id === id);
    if (!ctx) return false;
    if (contextForSource(source)) return false;
    updateContext(id, { sources: [...(ctx.sources ?? []), source] });
    return true;
  }
  function removeContextSource(id, index) {
    const ctx = contexts.value.find(c => c.id === id);
    if (!ctx) return;
    updateContext(id, { sources: (ctx.sources ?? []).filter((_, i) => i !== index) });
  }

  // Move a source from its current context (if any) to a target context.
  // Used by the context-menu quick-assign path.
  // Find and remove whichever source in `ctx` overlaps with `source`.
  // The stored source may be broader than `source` (e.g. a whole-repo source
  // covering a sub-path), so we match with sourcesOverlap rather than sameSource.
  function removeCoveringSource(ctx, source) {
    const idx = ctx.sources.findIndex(s => sourcesOverlap(s, source, repoPaths));
    if (idx !== -1) removeContextSource(ctx.id, idx);
  }

  function moveContextSource(source, targetContextId) {
    const current = contextForSource(source);
    if (current) removeCoveringSource(current, source);
    addContextSource(targetContextId, source);
  }

  // Create a new context with a source pre-assigned, evicting it from any
  // existing context first. Used by the "Create new context" panel flow.
  function createContextWithSource(name, source) {
    const current = contextForSource(source);
    if (current) removeCoveringSource(current, source);
    return addContext(name, [source]);
  }

  // ── Right-click "Add to bounded context" hand-off ───────────────────────────
  // A node's context menu records the source here; MappingEditor watches it,
  // opens the Bounded Contexts tab, and lets the user confirm the target.
  const pendingContextSource = ref(null); // { source, label } | null
  function beginAddToContext(source, label) {
    pendingContextSource.value = { source, label };
  }
  function clearPendingContextSource() {
    pendingContextSource.value = null;
  }

  // Author normalization CRUD
  function setNormalization(raw, canonical) {
    authorNormalizations.value = { ...authorNormalizations.value, [raw]: canonical };
  }
  function removeNormalization(raw) {
    const next = { ...authorNormalizations.value };
    delete next[raw];
    authorNormalizations.value = next;
  }

  // Ignored authors CRUD
  function ignoreAuthor(name) {
    if (!ignoredAuthors.value.includes(name))
      ignoredAuthors.value = [...ignoredAuthors.value, name];
  }
  function unignoreAuthor(name) {
    ignoredAuthors.value = ignoredAuthors.value.filter(a => a !== name);
  }

  // Simulation
  function clearData() {
    commits.value  = [];
    dataLoaded.value    = false;
    dataError.value     = null;
    dateInfo.value      = null;
    activeRange.value   = { since: null, until: null };
    expandedTeams.value = new Set();
    // Clear auto-generated sim teams; leave user-configured teams intact
    if (teams.value.every(t => t.id.startsWith('sim-team-'))) teams.value = [];
  }

  function loadSimulatedData({ authorCount, repoCount, minCommits, maxCommits }) {
    const { rows, teams: simTeams, dateInfo: simDateInfo } =
      generateSimulatedData({ authorCount, repoCount, minCommits, maxCommits, colors: DEFAULT_COLORS });

    commits.value       = rows;
    teams.value         = simTeams;
    dateInfo.value      = simDateInfo;
    dataLoaded.value    = true;
    dataError.value     = null;
    activeRange.value   = { since: null, until: null };
    expandedTeams.value = new Set();
  }

  // Filter actions
  function setFilterTeam(id, active) {
    const next = new Set(filterTeamIds.value);
    if (active) next.add(id); else next.delete(id);
    filterTeamIds.value = next;
  }
  function setFilterContext(id, active) {
    const next = new Set(filterContextIds.value);
    if (active) next.add(id); else next.delete(id);
    filterContextIds.value = next;
  }
  function setFilterAuthor(id, active) {
    const next = new Set(filterAuthorIds.value);
    if (active) next.add(id); else next.delete(id);
    filterAuthorIds.value = next;
  }
  function clearAllFilters() {
    filterTeamIds.value    = new Set();
    filterContextIds.value = new Set();
    filterAuthorIds.value  = new Set();
  }

  // Import / Export
  function exportMappings() {
    return JSON.stringify({
      version: 3,
      contexts: contexts.value,
      teams: teams.value,
      authorNormalizations: authorNormalizations.value,
      ignoredAuthors: ignoredAuthors.value,
    }, null, 2);
  }

  function importMappings(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid mapping file — expected a JSON object.');
    // v3: teams reference bounded contexts via a `contexts` array; an explicit
    // top-level `contexts` array defines them. Files without it rely on
    // auto-contexts (one per repo, id === repo name).
    if (Array.isArray(data.contexts))
      contexts.value = data.contexts;
    if (Array.isArray(data.teams))
      teams.value = data.teams.map(t => ({ authors: [], contexts: [], ...t }));
    if (data.authorNormalizations && typeof data.authorNormalizations === 'object' && !Array.isArray(data.authorNormalizations))
      authorNormalizations.value = data.authorNormalizations;
    if (Array.isArray(data.ignoredAuthors))
      ignoredAuthors.value = data.ignoredAuthors;
  }

  // ── Named Lenses ─────────────────────────────────────────────────────────────

  function _lensSnapshot() {
    return {
      teams:                JSON.parse(JSON.stringify(teams.value)),
      contexts:             JSON.parse(JSON.stringify(contexts.value)),
      authorNormalizations: JSON.parse(JSON.stringify(authorNormalizations.value)),
      ignoredAuthors:       [...ignoredAuthors.value],
      vizSettings:          { ...vizSettings.value },
    };
  }

  function saveLens(name) {
    const id = Date.now().toString();
    lenses.value = [...lenses.value, {
      id,
      name:      name.trim() || 'Unnamed Lens',
      createdAt: new Date().toISOString().slice(0, 10),
      ..._lensSnapshot(),
    }];
    activeLensId.value = id;
    return id;
  }

  function overwriteLens(id) {
    lenses.value = lenses.value.map(l =>
      l.id === id ? { ...l, ..._lensSnapshot() } : l
    );
  }

  // True when the current mapping state differs from the active lens snapshot.
  // Uses JSON serialisation for a deep, ordering-sensitive comparison — safe
  // because _lensSnapshot() already normalises via JSON.parse/stringify.
  const isDirty = computed(() => {
    if (!activeLensId.value) return false;
    const lens = lenses.value.find(l => l.id === activeLensId.value);
    if (!lens) return false;
    const snap = _lensSnapshot();
    return (
      JSON.stringify(snap.teams)                !== JSON.stringify(lens.teams)                ||
      JSON.stringify(snap.contexts)             !== JSON.stringify(lens.contexts)             ||
      JSON.stringify(snap.authorNormalizations) !== JSON.stringify(lens.authorNormalizations) ||
      JSON.stringify(snap.ignoredAuthors)       !== JSON.stringify(lens.ignoredAuthors)       ||
      JSON.stringify(snap.vizSettings)          !== JSON.stringify(lens.vizSettings)
    );
  });

  function loadLens(id) {
    const lens = lenses.value.find(l => l.id === id);
    if (!lens) return;
    importMappings({
      version: 3,
      teams:                lens.teams,
      contexts:             lens.contexts,
      authorNormalizations: lens.authorNormalizations,
      ignoredAuthors:       lens.ignoredAuthors,
    });
    if (lens.vizSettings) vizSettings.value = { ...VIZ_DEFAULTS, ...lens.vizSettings };
    activeLensId.value = id;
  }

  function updateLens(id, patch) {
    lenses.value = lenses.value.map(l => l.id === id ? { ...l, ...patch } : l);
  }

  function deleteLens(id) {
    lenses.value = lenses.value.filter(l => l.id !== id);
    if (activeLensId.value === id) activeLensId.value = null;
  }

  function exportLens(id) {
    const lens = lenses.value.find(l => l.id === id);
    if (!lens) return null;
    return JSON.stringify({ ...lens, version: 4 }, null, 2);
  }

  function importLensFromData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid lens file — expected a JSON object.');
    const id = Date.now().toString();
    const lens = {
      id,
      name:                 data.name             ?? 'Imported Lens',
      createdAt:            data.createdAt        ?? new Date().toISOString().slice(0, 10),
      teams:                Array.isArray(data.teams)          ? data.teams.map(t => ({ authors: [], contexts: [], ...t })) : [],
      contexts:             Array.isArray(data.contexts)       ? data.contexts : [],
      authorNormalizations: (data.authorNormalizations && typeof data.authorNormalizations === 'object' && !Array.isArray(data.authorNormalizations)) ? data.authorNormalizations : {},
      ignoredAuthors:       Array.isArray(data.ignoredAuthors) ? data.ignoredAuthors : [],
      vizSettings:          { ...VIZ_DEFAULTS, ...(data.vizSettings ?? {}) },
    };
    lenses.value = [...lenses.value, lens];
    loadLens(id);
    return id;
  }

  function resetVizSettings() {
    vizSettings.value = { ...VIZ_DEFAULTS };
  }

  // Returns {nodes, links} for a single repo: all contributing authors regardless of team.
  function repoContributorsData(repoId) {
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const edgeMap = {}; // author → commits (Set<sha>)
    const repoShas = new Set();
    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (row.repo !== repoId) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;
      const author = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;
      (edgeMap[author] ??= new Set()).add(row.commitHash);
      repoShas.add(row.commitHash);
    }
    const links = Object.entries(edgeMap).map(([author, shas]) => ({
      source: author, target: repoId, commits: shas.size,
    }));
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;
    const owningTeamId = allTeams.find(t => (t.contexts ?? []).includes(repoId))?.id ?? null;
    const nodes = [
      { id: repoId, type: 'repo', commits: repoShas.size, owningTeamId },
      ...links.map(l => ({ id: l.source, type: 'author', commits: l.commits })),
    ];
    return { nodes, links };
  }

  // Returns {nodes, links} for a bounded context using resolveContextId so that
  // path, glob, and multi-repo sources are all handled correctly.
  function contextContributorsData(contextId) {
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const edgeMap = {};
    const ctxShas = new Set();
    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (resolveContextId(row.repo, row.filePath) !== contextId) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;
      const author = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;
      (edgeMap[author] ??= new Set()).add(row.commitHash);
      ctxShas.add(row.commitHash);
    }
    const links = Object.entries(edgeMap).map(([author, shas]) => ({
      source: author, target: contextId, commits: shas.size,
    }));
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;
    const owningTeamId = allTeams.find(t => (t.contexts ?? []).includes(contextId))?.id ?? null;
    const ctx = allContexts.value.find(c => c.id === contextId);
    const nodes = [
      { id: contextId, name: ctx?.name ?? contextId, type: 'repo', commits: ctxShas.size, owningTeamId },
      ...links.map(l => ({ id: l.source, type: 'author', commits: l.commits })),
    ];
    return { nodes, links };
  }

  // Returns {nodes, links} scoped to a single source within a bounded context.
  // Filters commits to only those matching that source's repo + path/pattern.
  function sourceContributorsData(contextId, srcKey) {
    const src = decodeSourceKey(srcKey);
    if (!src) return contextContributorsData(contextId);
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const edgeMap = {};
    const srcShas = new Set();
    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (row.repo !== src.repo) continue;
      if (!matchesSource(src, row.filePath ?? '')) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;
      const author = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;
      (edgeMap[author] ??= new Set()).add(row.commitHash);
      srcShas.add(row.commitHash);
    }
    const links = Object.entries(edgeMap).map(([author, shas]) => ({
      source: author, target: contextId, commits: shas.size,
    }));
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;
    const owningTeamId = allTeams.find(t => (t.contexts ?? []).includes(contextId))?.id ?? null;
    const ctx = allContexts.value.find(c => c.id === contextId);
    const nodes = [
      { id: contextId, name: ctx?.name ?? contextId, type: 'repo', commits: srcShas.size, owningTeamId },
      ...links.map(l => ({ id: l.source, type: 'author', commits: l.commits })),
    ];
    return { nodes, links };
  }

  // Returns per-source commit counts for a bounded context.
  // Each entry: { ...src, key, label, commits }
  function contextSourceData(contextId) {
    const ctx = allContexts.value.find(c => c.id === contextId);
    if (!ctx || !ctx.sources?.length) return [];
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const sourceShas = ctx.sources.map(() => new Set());
    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;
      const author = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;
      for (let i = 0; i < ctx.sources.length; i++) {
        const src = ctx.sources[i];
        if (src.repo !== row.repo) continue;
        if (matchesSource(src, row.filePath ?? '')) sourceShas[i].add(row.commitHash);
      }
    }
    return ctx.sources.map((src, i) => ({
      ...src,
      key: sourceKey(src),
      label: sourceLabel(src),
      commits: sourceShas[i].size,
    }));
  }

  // Returns {nodes, links} for a repo drilled into a specific folder path.
  // folderPrefix = '' for top-level, 'src' for inside src/, 'src/auth' for inside src/auth/, etc.
  function repoFolderData(repoId, folderPrefix = '') {
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;

    // segment → author → Set<sha>, and whether segment has deeper paths
    const segmentAuthorShas  = {};
    const segmentHasChildren = {};
    const segmentLastDate    = {};

    for (const row of commits.value) {
      if (!row.author || !row.repo || !row.commitHash) continue;
      if (row.repo !== repoId) continue;
      if (since && row.date < since) continue;
      if (until && row.date > until) continue;
      const author = normalizeAuthor(row.author);
      if (ignoredSet.value.has(author)) continue;

      const filePath = row.filePath ?? '';

      let segment;
      if (folderPrefix === '') {
        const slash = filePath.indexOf('/');
        if (slash === -1) { segment = filePath; segmentHasChildren[filePath] = segmentHasChildren[filePath] || false; }
        else              { segment = filePath.slice(0, slash); segmentHasChildren[segment] = true; }
      } else {
        const prefix = folderPrefix + '/';
        if (!filePath.startsWith(prefix)) continue;
        const rest = filePath.slice(prefix.length);
        if (!rest) continue;
        const slash = rest.indexOf('/');
        if (slash === -1) { segment = rest; segmentHasChildren[rest] = segmentHasChildren[rest] || false; }
        else              { segment = rest.slice(0, slash); segmentHasChildren[segment] = true; }
      }
      if (!segment) continue;

      ((segmentAuthorShas[segment] ??= {})[author] ??= new Set()).add(row.commitHash);
      if (row.date && (!segmentLastDate[segment] || row.date > segmentLastDate[segment])) {
        segmentLastDate[segment] = row.date;
      }
    }

    const folderNodes = [];
    const links = [];
    const authorTotalShas = {};
    const allShas = new Set();

    for (const [segment, authorMap] of Object.entries(segmentAuthorShas)) {
      const folderShas = new Set();
      for (const [author, shas] of Object.entries(authorMap)) {
        shas.forEach(s => { folderShas.add(s); allShas.add(s); });
        links.push({ source: author, target: segment, commits: shas.size });
        (authorTotalShas[author] ??= new Set());
        shas.forEach(s => authorTotalShas[author].add(s));
      }
      const fullPath = folderPrefix ? `${folderPrefix}/${segment}` : segment;
      folderNodes.push({ id: segment, type: 'folder', commits: folderShas.size, hasChildren: segmentHasChildren[segment] ?? false, fullPath, lastCommit: segmentLastDate[segment] ?? null });
    }

    const owningTeamId = allTeams.find(t => (t.contexts ?? []).includes(repoId))?.id ?? null;
    const nodes = [
      { id: repoId, type: 'repo', commits: allShas.size, owningTeamId },
      ...folderNodes,
      ...Object.entries(authorTotalShas).map(([id, shas]) => ({ id, type: 'author', commits: shas.size })),
    ];

    return { nodes, links };
  }

  return {
    commits, dataLoaded, dataError, dateInfo,
    teams, syntheticTeam, authorNormalizations, ignoredAuthors,
    contexts, allContexts,
    dateBounds, activeRange,
    crossTeamOnly,
    filterTeamIds, filterContextIds, filterAuthorIds,
    expandedTeams,
    allRawAuthors, allAuthors, allRepos,
    graphData, ownershipGraphData, nodeColors, getNodeColor,
    repoContributorsData, contextContributorsData, sourceContributorsData, contextSourceData, repoFolderData,
    loadCommits, loadSimulatedData, clearData,
    nextTeamDefaults, addTeam, removeTeam,
    addContext, removeContext, updateContext, addContextSource, removeContextSource, contextForSource,
    moveContextSource, createContextWithSource,
    pendingContextSource, beginAddToContext, clearPendingContextSource,
    setFilterTeam, setFilterContext, setFilterAuthor, clearAllFilters,
    setNormalization, removeNormalization,
    ignoreAuthor, unignoreAuthor,
    toggleTeamExpansion,
    exportMappings, importMappings,
    vizSettings, resetVizSettings,
    lenses, activeLensId, isDirty, uiLensOpen,
    saveLens, overwriteLens, loadLens, updateLens, deleteLens, exportLens, importLensFromData,
    mappingEverOpened, markMappingOpened, dismissSpotlight, showMappingSpotlight,
  };
});
