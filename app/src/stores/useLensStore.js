import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import Papa from 'papaparse';

const STORAGE = {
  teams:          'conwaylens:teams',
  normalizations: 'conwaylens:normalizations',
  ignoredAuthors: 'conwaylens:ignoredAuthors',
};

const DEFAULT_COLORS = ['#225EA9', '#088F9B', '#F08223', '#5A4A80', '#C45E0F', '#006B75', '#3A75BA', '#1A9FA9'];

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export const useLensStore = defineStore('lens', () => {
  const timelineData = ref([]);
  const dataLoaded   = ref(false);
  const dataError    = ref(null);
  const dateInfo     = ref(null);

  const teams                = ref(load(STORAGE.teams, []));
  const authorNormalizations = ref(load(STORAGE.normalizations, {}));
  const ignoredAuthors       = ref(load(STORAGE.ignoredAuthors, []));

  watch(teams,                v => localStorage.setItem(STORAGE.teams,         JSON.stringify(v)), { deep: true });
  watch(authorNormalizations, v => localStorage.setItem(STORAGE.normalizations, JSON.stringify(v)), { deep: true });
  watch(ignoredAuthors,       v => localStorage.setItem(STORAGE.ignoredAuthors,  JSON.stringify(v)), { deep: true });

  const activeRange = ref({ since: null, until: null });

  // Drill-down expansion state
  const expandedTeams = ref(new Set()); // Set<teamId> — teams expanded to show their repo nodes
  const expandedNodes = ref(new Set()); // Set<nodeId> — repo IDs and folder IDs expanded to show children

  async function loadTimelineData(file) {
    dataError.value = null;
    try {
      const text  = new TextDecoder('utf-8').decode(await file.arrayBuffer());
      const lines = text.split(/\r?\n/).filter(Boolean);
      let parsedDateInfo = null;
      if (lines.at(-1)?.startsWith('Since=')) {
        const m = lines.pop().match(/Since=([\d-]+)?(?:,Until=([\d-]+))?/);
        if (m) parsedDateInfo = { since: m[1] ?? null, until: m[2] ?? null };
      }
      const { data } = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true });
      timelineData.value = data;
      dateInfo.value     = parsedDateInfo;
      dataLoaded.value   = true;
      activeRange.value  = { since: null, until: null };
      expandedTeams.value = new Set();
      expandedNodes.value = new Set();
    } catch (err) {
      dataError.value  = err.message;
      dataLoaded.value = false;
    }
  }

  function normalizeAuthor(name) { return authorNormalizations.value[name] ?? name; }

  const allRawAuthors = computed(() =>
    [...new Set(timelineData.value.map(r => r.Author))].filter(Boolean).sort()
  );
  const allAuthors = computed(() =>
    [...new Set(allRawAuthors.value.map(normalizeAuthor))].sort()
  );
  const allRepos = computed(() =>
    [...new Set(timelineData.value.map(r => r.Product))].filter(Boolean).sort()
  );

  // Repos that have FilePath data — these support folder drill-down
  const reposWithFilePaths = computed(() => {
    const s = new Set();
    for (const row of timelineData.value) {
      if (row.FilePath && row.Product) s.add(row.Product);
    }
    return s;
  });

  const ignoredSet = computed(() => new Set(ignoredAuthors.value));

  const dateBounds = computed(() => {
    let min = null, max = null;
    for (const row of timelineData.value) {
      if (!row.Date) continue;
      if (!min || row.Date < min) min = row.Date;
      if (!max || row.Date > max) max = row.Date;
    }
    return min ? { since: min, until: max } : null;
  });

  const crossTeamOnly = ref(false);

  const graphData = computed(() => {
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const hasTeamSetup = teams.value.length > 0;

    // Build team membership lookups
    const authorToTeams = {}; // normalizedAuthor → Set<teamId>
    const repoToTeam    = {}; // repoId → teamId (last write wins if repo appears in multiple teams)

    if (hasTeamSetup) {
      for (const t of teams.value) {
        for (const a of (t.authors ?? [])) {
          if (!authorToTeams[a]) authorToTeams[a] = new Set();
          authorToTeams[a].add(t.id);
        }
        for (const r of (t.repos ?? [])) repoToTeam[r] = t.id;
      }
    }

    // Pre-pass: count total unique commit SHAs per team (includes within-team work).
    // Used to size and show team nodes even when they have no cross-team edges.
    const teamTotalShas = {};
    if (hasTeamSetup) {
      for (const row of timelineData.value) {
        if (!row.Author || !row.Product || !row.ChangesetId) continue;
        if (since && row.Date < since) continue;
        if (until && row.Date > until) continue;
        const author = normalizeAuthor(row.Author);
        if (ignoredSet.value.has(author)) continue;
        for (const tid of (authorToTeams[author] ?? new Set())) {
          (teamTotalShas[tid] ??= new Set()).add(row.ChangesetId);
        }
      }
    }

    // Given a repoId and filePath, find the effective target node ID based on current expansion state.
    // Walks from repo → folder depth-1 → depth-2 … up to depth 4, stopping at the first unexpanded level.
    function getEffectiveNodeId(repoId, filePath) {
      if (hasTeamSetup) {
        const repoTeamId = repoToTeam[repoId];
        if (repoTeamId && !expandedTeams.value.has(repoTeamId)) {
          return `team:${repoTeamId}`;
        }
      }

      if (!expandedNodes.value.has(repoId) || !filePath) {
        return repoId;
      }

      const normalized = filePath.replace(/\\/g, '/');
      const dirParts   = normalized.split('/').slice(0, -1); // strip filename

      if (dirParts.length === 0) {
        return `${repoId}::(root)`;
      }

      for (let d = 1; d <= Math.min(4, dirParts.length); d++) {
        const folderPath   = dirParts.slice(0, d).join('/');
        const folderNodeId = `${repoId}::${folderPath}`;

        if (!expandedNodes.value.has(folderNodeId)) {
          return folderNodeId; // this folder is not expanded — land here
        }
        if (d === dirParts.length || d === 4) {
          return folderNodeId; // file sits directly in this folder, or we've hit max depth
        }
        // folder IS expanded — descend one more level
      }

      return repoId; // unreachable fallback
    }

    // Accumulate edges: `source|||target` → Set<commitSHA>
    const edgeMap     = {};
    const sourceTypes = {}; // id → 'author' | 'team'
    const targetIsRepo = new Set(); // ids that appear as plain repo targets

    function addEdge(source, target, sha) {
      const key = `${source}|||${target}`;
      (edgeMap[key] ??= new Set()).add(sha);
    }

    for (const row of timelineData.value) {
      if (!row.Author || !row.Product || !row.ChangesetId) continue;
      if (since && row.Date < since) continue;
      if (until && row.Date > until) continue;
      const author = normalizeAuthor(row.Author);
      if (ignoredSet.value.has(author)) continue;

      const repoId   = row.Product;
      const filePath = row.FilePath || '';
      const targetId = getEffectiveNodeId(repoId, filePath);

      // Track plain repo targets (not team or folder) so we can assign the correct node type later
      if (!targetId.startsWith('team:') && !targetId.includes('::')) {
        targetIsRepo.add(targetId);
      }

      if (!hasTeamSetup) {
        addEdge(author, targetId, row.ChangesetId);
        sourceTypes[author] = 'author';
      } else {
        const authorTeams = authorToTeams[author] ?? new Set();
        const repoTeamId  = repoToTeam[repoId];

        if (authorTeams.size === 0) {
          // Unassigned author — individual node, direct edge to target
          addEdge(author, targetId, row.ChangesetId);
          sourceTypes[author] = 'author';
        } else {
          for (const authorTeamId of authorTeams) {
            if (expandedTeams.value.has(authorTeamId)) {
              // Author's team is expanded — show as individual node
              addEdge(author, targetId, row.ChangesetId);
              sourceTypes[author] = 'author';
            } else {
              // Author's team is collapsed — source is the team node.
              // Skip within-team contributions (author team === repo team, both collapsed).
              const targetTeamId = targetId.startsWith('team:') ? targetId.slice(5) : repoTeamId;
              if (authorTeamId === targetTeamId) continue;

              const sourceId = `team:${authorTeamId}`;
              addEdge(sourceId, targetId, row.ChangesetId);
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

        // individual author → repo / folder
        const authorTeams = authorToTeams[src] ?? new Set();
        const repoId      = tgt.includes('::') ? tgt.split('::')[0] : tgt;
        const repoTeamId  = repoToTeam[repoId];
        if (!repoTeamId) return true;
        if (authorTeams.size === 0) return true;
        return [...authorTeams].some(tid => tid !== repoTeamId);
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
      for (const t of teams.value) {
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
        const team   = teams.value.find(t => t.id === teamId);
        return {
          id, type: 'team', teamId,
          name:        team?.name  ?? teamId,
          color:       team?.color ?? DEFAULT_COLORS[0],
          repoCount:   (team?.repos    ?? []).length,
          authorCount: (team?.authors  ?? []).length,
          commits,
        };
      }
      if (id.includes('::')) {
        const sep        = id.indexOf('::');
        const repoId     = id.slice(0, sep);
        const folderPath = id.slice(sep + 2);
        const depth      = folderPath === '(root)' ? 1 : folderPath.split('/').length;
        const label      = folderPath === '(root)' ? '(root)' : folderPath.split('/').at(-1);
        return { id, type: 'folder', repoId, folderPath, depth, label, commits };
      }
      // Author or repo — authors appear only as sources, repos only as targets
      const type = targetIsRepo.has(id) ? 'repo' : (sourceTypes[id] === 'team' ? 'team' : 'author');
      return { id, type, commits };
    });

    return { nodes, links };
  });

  // Lookup map: `${type}:${id}` → team hex color (for author/repo coloring)
  const nodeColors = computed(() => {
    const map = {};
    teams.value.forEach((t, i) => {
      const color = t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      for (const a of (t.authors ?? [])) map[`author:${a}`] = color;
      for (const r of (t.repos   ?? [])) map[`repo:${r}`]   = color;
    });
    return map;
  });

  function getNodeColor(id, type) {
    return nodeColors.value[`${type}:${id}`] ?? '#9CA3AF';
  }

  // Drill-down actions

  function toggleTeamExpansion(teamId) {
    const next = new Set(expandedTeams.value);
    if (next.has(teamId)) {
      next.delete(teamId);
      // Collapse all repo/folder expansions that belong to this team
      const team = teams.value.find(t => t.id === teamId);
      if (team) {
        const nodeNext = new Set(expandedNodes.value);
        for (const repo of (team.repos ?? [])) {
          for (const id of nodeNext) {
            if (id === repo || id.startsWith(repo + '::')) nodeNext.delete(id);
          }
        }
        expandedNodes.value = nodeNext;
      }
    } else {
      next.add(teamId);
    }
    expandedTeams.value = next;
  }

  function toggleNodeExpansion(nodeId) {
    const next = new Set(expandedNodes.value);
    if (next.has(nodeId)) {
      // Collapse this node and all its expanded descendants
      for (const id of [...next]) {
        if (id === nodeId || id.startsWith(nodeId + '::')) next.delete(id);
      }
    } else {
      next.add(nodeId);
    }
    expandedNodes.value = next;
  }

  // Team CRUD
  function addTeam() {
    teams.value.push({
      id:      Date.now().toString(),
      name:    `Team ${teams.value.length + 1}`,
      color:   DEFAULT_COLORS[teams.value.length % DEFAULT_COLORS.length],
      authors: [],
      repos:   [],
    });
  }
  function removeTeam(id) { teams.value = teams.value.filter(t => t.id !== id); }

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

  // Import / Export
  function exportMappings() {
    return JSON.stringify({
      version: 1,
      teams: teams.value,
      authorNormalizations: authorNormalizations.value,
      ignoredAuthors: ignoredAuthors.value,
    }, null, 2);
  }

  function importMappings(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid mapping file — expected a JSON object.');
    if (Array.isArray(data.teams))
      teams.value = data.teams;
    if (data.authorNormalizations && typeof data.authorNormalizations === 'object' && !Array.isArray(data.authorNormalizations))
      authorNormalizations.value = data.authorNormalizations;
    if (Array.isArray(data.ignoredAuthors))
      ignoredAuthors.value = data.ignoredAuthors;
  }

  return {
    timelineData, dataLoaded, dataError, dateInfo,
    teams, authorNormalizations, ignoredAuthors,
    dateBounds, activeRange,
    crossTeamOnly,
    expandedTeams, expandedNodes, reposWithFilePaths,
    allRawAuthors, allAuthors, allRepos,
    graphData, nodeColors, getNodeColor,
    loadTimelineData,
    addTeam, removeTeam,
    setNormalization, removeNormalization,
    ignoreAuthor, unignoreAuthor,
    toggleTeamExpansion, toggleNodeExpansion,
    exportMappings, importMappings,
  };
});
