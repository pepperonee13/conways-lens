import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import Papa from 'papaparse';

const STORAGE = {
  teams:        'conwaylens:teams',
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

  const graphData = computed(() => {
    const since = activeRange.value.since;
    const until = activeRange.value.until;
    const edgeMap = {};
    for (const row of timelineData.value) {
      if (!row.Author || !row.Product || !row.ChangesetId) continue;
      if (since && row.Date < since) continue;
      if (until && row.Date > until) continue;
      const author = normalizeAuthor(row.Author);
      if (ignoredSet.value.has(author)) continue;
      const key = `${author}|||${row.Product}`;
      (edgeMap[key] ??= new Set()).add(row.ChangesetId);
    }

    let links = Object.entries(edgeMap).map(([key, shas]) => {
      const sep = key.indexOf('|||');
      return { source: key.slice(0, sep), target: key.slice(sep + 3), commits: shas.size };
    });

    if (crossTeamOnly.value && teams.value.length > 0) {
      const aTeam = {}, rTeam = {};
      for (const t of teams.value) {
        for (const a of (t.authors ?? [])) aTeam[a] = t.id;
        for (const r of (t.repos   ?? [])) rTeam[r] = t.id;
      }
      links = links.filter(l => aTeam[l.source] && rTeam[l.target] && aTeam[l.source] !== rTeam[l.target]);
    }

    const authorCommits = {};
    const repoCommits   = {};
    for (const l of links) {
      authorCommits[l.source] = (authorCommits[l.source] ?? 0) + l.commits;
      repoCommits[l.target]   = (repoCommits[l.target]   ?? 0) + l.commits;
    }

    return {
      nodes: [
        ...Object.entries(authorCommits).map(([id, commits]) => ({ id, type: 'author', commits })),
        ...Object.entries(repoCommits)  .map(([id, commits]) => ({ id, type: 'repo',   commits })),
      ],
      links,
    };
  });

  // Lookup map: `${type}:${id}` → team color
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

  // Team CRUD
  function addTeam() {
    teams.value.push({
      id: Date.now().toString(),
      name: `Team ${teams.value.length + 1}`,
      color: DEFAULT_COLORS[teams.value.length % DEFAULT_COLORS.length],
      authors: [],
      repos: [],
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
    allRawAuthors, allAuthors, allRepos,
    graphData, nodeColors, getNodeColor,
    loadTimelineData,
    addTeam, removeTeam,
    setNormalization, removeNormalization,
    ignoreAuthor, unignoreAuthor,
    exportMappings, importMappings,
  };
});
