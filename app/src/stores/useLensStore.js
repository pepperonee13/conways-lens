import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import Papa from 'papaparse';

const STORAGE = {
  teams: 'conwaylens:teams',
  teamColors: 'conwaylens:teamColors',
  authorNormalizations: 'conwaylens:authorNormalizations',
};

const DEFAULT_TEAM_COLORS = [
  '#225EA9', '#088F9B', '#F08223', '#5A4A80',
  '#C45E0F', '#006B75', '#3A75BA', '#1A9FA9',
];

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const useLensStore = defineStore('lens', () => {
  // Raw timeline rows (one per file per commit)
  const timelineData = ref([]);
  const dataLoaded = ref(false);
  const dataError = ref(null);
  const dateInfo = ref(null);

  // Teams — each has: { id, name, color, authors: string[], products: string[] }
  // `products` field stores repo names for CSV compatibility with NetworkGraph
  const teams = ref(load(STORAGE.teams, []));

  // Author normalizations — maps raw git author names to canonical display names
  // e.g. { "j.doe@company.com": "Jane Doe", "janedoe": "Jane Doe" }
  const authorNormalizations = ref(load(STORAGE.authorNormalizations, {}));

  // Filters
  const filters = ref({ products: [], authors: [], minPercent: 0 });
  const dateRangeFilter = ref({ from: null, to: null });

  // Persist teams and normalizations to localStorage whenever they change
  watch(teams, val => save(STORAGE.teams, val), { deep: true });
  watch(authorNormalizations, val => save(STORAGE.authorNormalizations, val), { deep: true });

  // ---------------------------------------------------------------------------
  // Load CSV from a File object
  // ---------------------------------------------------------------------------
  async function loadTimelineData(file) {
    dataError.value = null;
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(buffer);

      const lines = text.split(/\r?\n/).filter(Boolean);
      let parsedDateInfo = null;

      if (lines.length && lines[lines.length - 1].startsWith('Since=')) {
        const match = lines[lines.length - 1].match(/Since=([\d-]+)?(?:,Until=([\d-]+))?/);
        if (match) parsedDateInfo = { since: match[1] || null, until: match[2] || null };
        lines.pop();
      }

      const parsed = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true });
      timelineData.value = parsed.data.map(row => ({
        ...row,
        Date: new Date(row.DateTime || row.Date),
        FormattedDate: row.Date,
      }));

      dateInfo.value = parsedDateInfo;
      dataLoaded.value = true;
    } catch (err) {
      dataError.value = err.message;
      dataLoaded.value = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Discovered values from CSV
  // ---------------------------------------------------------------------------

  function normalizeAuthor(name) {
    return authorNormalizations.value[name] ?? name;
  }

  // All raw author names as they appear in the CSV (before normalization)
  const allRawAuthors = computed(() =>
    [...new Set(timelineData.value.map(r => r.Author))].filter(Boolean).sort((a, b) => a.localeCompare(b))
  );

  // Unique canonical author names after applying normalizations
  const allAuthors = computed(() =>
    [...new Set(allRawAuthors.value.map(normalizeAuthor))].sort((a, b) => a.localeCompare(b))
  );

  const allRepos = computed(() =>
    [...new Set(timelineData.value.map(r => r.Product))].filter(Boolean).sort((a, b) => a.localeCompare(b))
  );

  // ---------------------------------------------------------------------------
  // Team helpers
  // ---------------------------------------------------------------------------
  function teamColor(team, index) {
    return team.color || DEFAULT_TEAM_COLORS[index % DEFAULT_TEAM_COLORS.length];
  }

  const teamColors = computed(() => {
    const map = {};
    teams.value.forEach((t, i) => { map[t.name] = teamColor(t, i); });
    return map;
  });

  const authorColors = computed(() => {
    const map = {};
    teams.value.forEach((t, i) => {
      const color = teamColor(t, i);
      (t.authors || []).forEach(author => { map[author] = color; });
    });
    allAuthors.value.forEach(a => { if (!map[a]) map[a] = '#adb5bd'; });
    return map;
  });

  // repo → team name (used by NetworkGraph as productTeamMap)
  const productTeamMap = computed(() => {
    const map = {};
    teams.value.forEach(t => {
      (t.products || []).forEach(repo => { map[repo] = t.name; });
    });
    return map;
  });

  // Empty map kept for NetworkGraph compat (no raw→display alias needed)
  const authorMap = computed(() => ({}));

  // ---------------------------------------------------------------------------
  // Data aggregation with optional date range
  // ---------------------------------------------------------------------------
  const effectiveData = computed(() => {
    const { from, to } = dateRangeFilter.value;
    const rows = timelineData.value.filter(row => {
      const d = row.Date;
      if (from && d < new Date(from)) return false;
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        if (d > toDate) return false;
      }
      return true;
    });

    const map = {};
    rows.forEach(row => {
      const author = normalizeAuthor(row.Author);
      const key = `${author}|||${row.Product}`;
      if (!map[key]) {
        map[key] = {
          Author: author,
          Product: row.Product,
          ContributionCount: 0,
          _commits: new Set(),
          _files: new Set(),
        };
      }
      map[key]._commits.add(row.ChangesetId);
      if (row.FilePath) map[key]._files.add(row.FilePath);
    });

    return Object.values(map).map(({ _commits, _files, ...rest }) => ({
      ...rest,
      ContributionCount: _commits.size,
      FileCount: _files.size,
    }));
  });

  const filteredData = computed(() => {
    let d = effectiveData.value;
    if (filters.value.products.length)
      d = d.filter(r => filters.value.products.includes(r.Product));
    if (filters.value.authors.length)
      d = d.filter(r => filters.value.authors.includes(r.Author));
    return d;
  });

  // ---------------------------------------------------------------------------
  // Summary metrics
  // ---------------------------------------------------------------------------
  const totalContributions = computed(() =>
    filteredData.value.reduce((sum, r) => sum + r.ContributionCount, 0)
  );

  const productCount = computed(() =>
    new Set(filteredData.value.map(r => r.Product)).size
  );

  const authorCount = computed(() =>
    new Set(filteredData.value.map(r => r.Author)).size
  );

  const multiTeamProducts = computed(() => {
    if (!teams.value.length) return [];
    const result = [];
    const products = new Set(effectiveData.value.map(r => r.Product));
    products.forEach(product => {
      const authors = new Set(effectiveData.value.filter(r => r.Product === product).map(r => r.Author));
      const contributing = new Set();
      teams.value.forEach(t => {
        if ((t.authors || []).some(a => authors.has(a))) contributing.add(t.name);
      });
      if (contributing.size > 1) result.push(product);
    });
    return result.sort((a, b) => a.localeCompare(b));
  });

  // ---------------------------------------------------------------------------
  // Team CRUD
  // ---------------------------------------------------------------------------
  function addTeam() {
    teams.value.push({
      id: Date.now().toString(),
      name: `Team ${teams.value.length + 1}`,
      color: DEFAULT_TEAM_COLORS[teams.value.length % DEFAULT_TEAM_COLORS.length],
      authors: [],
      products: [],
    });
  }

  function removeTeam(id) {
    teams.value = teams.value.filter(t => t.id !== id);
  }

  function updateTeam(id, patch) {
    const t = teams.value.find(t => t.id === id);
    if (t) Object.assign(t, patch);
  }

  // ---------------------------------------------------------------------------
  // Filter setters
  // ---------------------------------------------------------------------------
  function setProducts(products) { filters.value.products = [...products]; }
  function setAuthors(authors) { filters.value.authors = [...authors]; }
  function setMinPercent(val) { filters.value.minPercent = val; }
  function setDateRange(from, to) {
    dateRangeFilter.value = { from: from || null, to: to || null };
  }

  // ---------------------------------------------------------------------------
  // Author normalization CRUD
  // ---------------------------------------------------------------------------
  function addAuthorNormalization(raw, canonical) {
    authorNormalizations.value = { ...authorNormalizations.value, [raw]: canonical };
  }

  function removeAuthorNormalization(raw) {
    const next = { ...authorNormalizations.value };
    delete next[raw];
    authorNormalizations.value = next;
  }

  // ---------------------------------------------------------------------------
  // Import / Export settings
  // ---------------------------------------------------------------------------
  function exportSettings() {
    return JSON.stringify({ teams: teams.value, authorNormalizations: authorNormalizations.value }, null, 2);
  }

  function importSettings(json) {
    try {
      const settings = JSON.parse(json);
      if (Array.isArray(settings.teams)) teams.value = settings.teams;
      if (settings.authorNormalizations && typeof settings.authorNormalizations === 'object' && !Array.isArray(settings.authorNormalizations)) {
        authorNormalizations.value = settings.authorNormalizations;
      }
    } catch (err) {
      throw new Error(`Invalid settings JSON: ${err.message}`);
    }
  }

  function displayAuthor(name) { return normalizeAuthor(name); }

  return {
    timelineData, dataLoaded, dataError, dateInfo,
    teams, teamColors, authorColors, productTeamMap, authorMap,
    filters, dateRangeFilter,
    effectiveData, filteredData,
    totalContributions, productCount, authorCount,
    allAuthors, allRawAuthors, allRepos,
    authorNormalizations,
    multiTeamProducts,
    loadTimelineData,
    addTeam, removeTeam, updateTeam,
    addAuthorNormalization, removeAuthorNormalization,
    setProducts, setAuthors, setMinPercent, setDateRange,
    exportSettings, importSettings,
    displayAuthor,
  };
});
