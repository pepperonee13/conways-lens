import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import Papa from 'papaparse';

const STORAGE = {
  teams:          'conwaylens:teams',
  normalizations: 'conwaylens:normalizations',
  ignoredAuthors: 'conwaylens:ignoredAuthors',
};

const DEFAULT_COLORS  = ['#225EA9', '#088F9B', '#F08223', '#5A4A80', '#C45E0F', '#006B75', '#3A75BA', '#1A9FA9'];
const UNASSIGNED_ID   = '__unassigned__';

const SIM_AUTHORS = [
  'Alice', 'Bob', 'Carlos', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry',
  'Iris', 'Jake', 'Karen', 'Liam', 'Mia', 'Noah', 'Olivia', 'Pete',
  'Quinn', 'Rachel', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yara', 'Zoe',
];
const SIM_REPOS = [
  'api-gateway', 'auth-service', 'payment-service', 'user-service',
  'notification-service', 'billing-service', 'search-service', 'analytics-service',
  'admin-portal', 'mobile-bff', 'data-pipeline', 'reporting-service',
  'inventory-service', 'order-service', 'shipping-service', 'catalog-service',
  'recommendation-engine', 'messaging-service', 'file-storage', 'config-service',
];

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export const useLensStore = defineStore('lens', () => {
  const timelineData = ref([]);
  const dataLoaded   = ref(false);
  const dataError    = ref(null);
  const dateInfo     = ref(null);

  const teams                = ref(load(STORAGE.teams, []).map(t => ({ authors: [], repos: [], ...t })));
  const authorNormalizations = ref(load(STORAGE.normalizations, {}));
  const ignoredAuthors       = ref(load(STORAGE.ignoredAuthors, []));

  watch(teams,                v => localStorage.setItem(STORAGE.teams,         JSON.stringify(v)), { deep: true });
  watch(authorNormalizations, v => localStorage.setItem(STORAGE.normalizations, JSON.stringify(v)), { deep: true });
  watch(ignoredAuthors,       v => localStorage.setItem(STORAGE.ignoredAuthors,  JSON.stringify(v)), { deep: true });

  const activeRange = ref({ since: null, until: null });

  // Drill-down expansion state
  const expandedTeams = ref(new Set()); // Set<teamId> — teams expanded to show their repo/author nodes

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

  // Virtual team for authors and repos not yet assigned to any real team.
  // Only exists when at least one real team is configured.
  const syntheticTeam = computed(() => {
    if (!dataLoaded.value || teams.value.length === 0) return null;
    const assignedAuthors = new Set(teams.value.flatMap(t => t.authors ?? []));
    const assignedRepos   = new Set(teams.value.flatMap(t => t.repos   ?? []));
    const freeAuthors = allAuthors.value.filter(a => !assignedAuthors.has(a) && !ignoredSet.value.has(a));
    const freeRepos   = allRepos.value.filter(r => !assignedRepos.has(r));
    if (freeAuthors.length === 0 && freeRepos.length === 0) return null;
    return {
      id: UNASSIGNED_ID, name: 'Outside Contributors', color: '#9CA3AF',
      authors: freeAuthors, repos: freeRepos, isSynthetic: true,
    };
  });

  const graphData = computed(() => {
    const since = activeRange.value.since;
    const until = activeRange.value.until;

    // Merge real teams with the synthetic "Outside Contributors" team so all
    // unassigned authors/repos are treated identically to real-team members.
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;
    const hasTeamSetup = allTeams.length > 0;

    // Build team membership lookups (synthetic team members included)
    const authorToTeams = {}; // normalizedAuthor → Set<teamId>
    const repoToTeam    = {}; // repoId → teamId

    if (hasTeamSetup) {
      for (const t of allTeams) {
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

    // Accumulate edges: `source|||target` → Set<commitSHA>
    const edgeMap     = {};
    const sourceTypes = {}; // id → 'author' | 'team'
    const targetIsRepo = new Set(); // ids that appear as repo targets

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

      const repoId = row.Product;

      // Resolve target: collapsed team node or plain repo
      let targetId = repoId;
      if (hasTeamSetup) {
        const repoTeamId = repoToTeam[repoId];
        if (repoTeamId && !expandedTeams.value.has(repoTeamId)) {
          targetId = `team:${repoTeamId}`;
        }
      }

      if (!targetId.startsWith('team:')) {
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

        // individual author → repo
        const authorTeams = authorToTeams[src] ?? new Set();
        const repoTeamId  = repoToTeam[tgt];
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
          repoCount:   (team?.repos    ?? []).length,
          authorCount: (team?.authors  ?? []).length,
          commits,
        };
      }
      // Author or repo — authors appear only as sources, repos only as targets
      const type = targetIsRepo.has(id) ? 'repo' : (sourceTypes[id] === 'team' ? 'team' : 'author');
      return { id, type, commits };
    });

    return { nodes, links };
  });

  // ── Ownership graph data ─────────────────────────────────────────────────────
  // Team-level cross-boundary view. Authors are never nodes — only teams and repos.
  // Every edge source is a team node; edges only cross team boundaries.
  const ownershipGraphData = computed(() => {
    const empty = { nodes: [], links: [] };
    if (teams.value.length === 0) return empty;

    const since = activeRange.value.since;
    const until = activeRange.value.until;

    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : [...teams.value];

    // Build membership lookups
    const authorToTeamId = {}; // normalizedAuthor → teamId (first assignment wins)
    const repoToTeamId   = {}; // repoId → teamId

    for (const t of allTeams) {
      for (const a of (t.authors ?? [])) {
        if (!(a in authorToTeamId)) authorToTeamId[a] = t.id;
      }
      for (const r of (t.repos ?? [])) repoToTeamId[r] = t.id;
    }

    // edge accumulation: `srcTeamId\x00targetId` → total commits (number)
    const edgeMap = {}; // key → commit count

    // Per-team total commit counting (for node sizing)
    const teamTotalCommits = {}; // teamId → commit count (unique SHAs)
    const teamTotalShas    = {}; // teamId → Set<sha>
    const teamAuthorShas   = {}; // `${teamId}\x00${author}` → Set<sha>

    // Per-repo commit counting
    const repoTotalShas          = {}; // repoId → Set<sha>
    const repoContribShas        = {}; // `${repoId}\x00${teamId}` → Set<sha>
    const repoAuthorShas         = {}; // `${repoId}\x00${author}` → Set<sha>

    for (const row of timelineData.value) {
      if (!row.Author || !row.Product || !row.ChangesetId) continue;
      if (since && row.Date < since) continue;
      if (until && row.Date > until) continue;

      const author     = normalizeAuthor(row.Author);
      if (ignoredSet.value.has(author)) continue;

      const repoId     = row.Product;
      const authorTeam = authorToTeamId[author];
      const owningTeam = repoToTeamId[repoId];
      const sha        = row.ChangesetId;

      // Accumulate total commits per team (author's team)
      if (authorTeam) {
        (teamTotalShas[authorTeam] ??= new Set()).add(sha);
        (teamAuthorShas[`${authorTeam}\x00${author}`] ??= new Set()).add(sha);
      }

      // Accumulate per-repo totals and per-(repo,team) contributions
      (repoTotalShas[repoId] ??= new Set()).add(sha);
      (repoAuthorShas[`${repoId}\x00${author}`] ??= new Set()).add(sha);
      if (authorTeam) {
        (repoContribShas[`${repoId}\x00${authorTeam}`] ??= new Set()).add(sha);
      }

      // Only cross-team edges: author team must differ from owning team
      if (!authorTeam) continue;                  // author has no team — skip
      if (authorTeam === owningTeam) continue;     // within-team — skip

      // Always target the repo directly so violation edges visibly cross sector boundaries.
      const key = `${authorTeam}\x00${repoId}`;
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
        repoCount:  (t.repos    ?? []).length,
        authorCount:(t.authors  ?? []).length,
        authorContributions,
      };
    });

    // Repo nodes: every repo that has commits in range (owned + unowned).
    const repoNodeIds = new Set(Object.keys(repoTotalShas));

    const repoNodes = [...repoNodeIds].map(repoId => {
      const owningTeamId  = repoToTeamId[repoId] ?? null;
      const owningTeam    = owningTeamId ? allTeams.find(t => t.id === owningTeamId) : null;
      const totalCommits  = repoTotalShas[repoId]?.size ?? 0;

      // Build contributions array sorted desc by commits
      const contributions = [];
      for (const t of allTeams) {
        const cnt = repoContribShas[`${repoId}\x00${t.id}`]?.size ?? 0;
        if (cnt > 0) contributions.push({ teamId: t.id, teamColor: t.color, commits: cnt });
      }
      contributions.sort((a, b) => b.commits - a.commits);

      const authorContributions = [];
      const repoPrefix = `${repoId}\x00`;
      for (const key in repoAuthorShas) {
        if (!key.startsWith(repoPrefix)) continue;
        const author    = key.slice(repoPrefix.length);
        const cnt       = repoAuthorShas[key].size;
        const pct       = totalCommits ? ((cnt / totalCommits) * 100).toFixed(1).replace(/\.0$/, '') : '0';
        const teamId    = authorToTeamId[author] ?? null;
        const teamColor = teamId ? (allTeams.find(t => t.id === teamId)?.color ?? '#9CA3AF') : '#9CA3AF';
        authorContributions.push({ authorId: author, commits: cnt, pct, teamColor, teamId });
      }
      authorContributions.sort((a, b) => b.commits - a.commits);

      return {
        id:           repoId,
        type:         'repo',
        owningTeamId,
        color:        owningTeam?.color ?? '#9CA3AF',
        commits:      totalCommits,
        contributions,
        authorContributions,
      };
    });

    return { nodes: [...teamNodes, ...repoNodes], links };
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
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    expandedTeams.value = next;
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

  // Simulation
  function clearData() {
    timelineData.value  = [];
    dataLoaded.value    = false;
    dataError.value     = null;
    dateInfo.value      = null;
    activeRange.value   = { since: null, until: null };
    expandedTeams.value = new Set();
  }

  function loadSimulatedData({ authorCount, repoCount, minCommits, maxCommits }) {
    const authors = SIM_AUTHORS.slice(0, authorCount);
    const repos   = SIM_REPOS.slice(0, repoCount);
    const now     = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const msRange = now - yearAgo;

    const rows = [];
    let shaSeq = 0;
    for (const author of authors) {
      for (const repo of repos) {
        if (Math.random() > 0.38) continue; // ~38% of pairs are active
        const count = minCommits + Math.floor(Math.random() * (maxCommits - minCommits + 1));
        for (let i = 0; i < count; i++) {
          const date = new Date(yearAgo.getTime() + Math.random() * msRange);
          const sha  = (++shaSeq).toString(16).padStart(8, '0') + Math.random().toString(16).slice(2, 10);
          rows.push({ Author: author, Product: repo, ChangesetId: sha, Date: date.toISOString().slice(0, 10) });
        }
      }
    }

    timelineData.value  = rows;
    dateInfo.value      = { since: yearAgo.toISOString().slice(0, 10), until: now.toISOString().slice(0, 10) };
    dataLoaded.value    = true;
    dataError.value     = null;
    activeRange.value   = { since: null, until: null };
    expandedTeams.value = new Set();
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
      teams.value = data.teams.map(t => ({ authors: [], repos: [], ...t }));
    if (data.authorNormalizations && typeof data.authorNormalizations === 'object' && !Array.isArray(data.authorNormalizations))
      authorNormalizations.value = data.authorNormalizations;
    if (Array.isArray(data.ignoredAuthors))
      ignoredAuthors.value = data.ignoredAuthors;
  }

  // Returns {nodes, links} for a single repo: all contributing authors regardless of team.
  function repoContributorsData(repoId) {
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const edgeMap = {}; // author → commits (Set<sha>)
    const repoShas = new Set();
    for (const row of timelineData.value) {
      if (!row.Author || !row.Product || !row.ChangesetId) continue;
      if (row.Product !== repoId) continue;
      if (since && row.Date < since) continue;
      if (until && row.Date > until) continue;
      const author = normalizeAuthor(row.Author);
      if (ignoredSet.value.has(author)) continue;
      (edgeMap[author] ??= new Set()).add(row.ChangesetId);
      repoShas.add(row.ChangesetId);
    }
    const links = Object.entries(edgeMap).map(([author, shas]) => ({
      source: author, target: repoId, commits: shas.size,
    }));
    const syntheticT = syntheticTeam.value;
    const allTeams   = syntheticT ? [...teams.value, syntheticT] : teams.value;
    const owningTeamId = allTeams.find(t => (t.repos ?? []).includes(repoId))?.id ?? null;
    const nodes = [
      { id: repoId, type: 'repo', commits: repoShas.size, owningTeamId },
      ...links.map(l => ({ id: l.source, type: 'author', commits: l.commits })),
    ];
    return { nodes, links };
  }

  return {
    timelineData, dataLoaded, dataError, dateInfo,
    teams, syntheticTeam, authorNormalizations, ignoredAuthors,
    dateBounds, activeRange,
    crossTeamOnly,
    expandedTeams,
    allRawAuthors, allAuthors, allRepos,
    graphData, ownershipGraphData, nodeColors, getNodeColor,
    repoContributorsData,
    loadTimelineData, loadSimulatedData, clearData,
    addTeam, removeTeam,
    setNormalization, removeNormalization,
    ignoreAuthor, unignoreAuthor,
    toggleTeamExpansion,
    exportMappings, importMappings,
  };
});
