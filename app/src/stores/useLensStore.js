import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import Papa from 'papaparse';

export const useLensStore = defineStore('lens', () => {
  const timelineData = ref([]);
  const dataLoaded   = ref(false);
  const dataError    = ref(null);
  const dateInfo     = ref(null);

  async function loadTimelineData(file) {
    dataError.value = null;
    try {
      const text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
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
    } catch (err) {
      dataError.value  = err.message;
      dataLoaded.value = false;
    }
  }

  // Aggregate raw rows into { nodes, links } for the graph.
  // One row per file per commit → deduplicate by ChangesetId per author×repo pair.
  const graphData = computed(() => {
    const edgeMap = {}; // `${author}|||${repo}` → Set<sha>

    for (const row of timelineData.value) {
      if (!row.Author || !row.Product || !row.ChangesetId) continue;
      const key = `${row.Author}|||${row.Product}`;
      (edgeMap[key] ??= new Set()).add(row.ChangesetId);
    }

    const links = Object.entries(edgeMap).map(([key, shas]) => {
      const sep = key.indexOf('|||');
      return { source: key.slice(0, sep), target: key.slice(sep + 3), commits: shas.size };
    });

    const authorCommits = {};
    const repoCommits   = {};
    for (const l of links) {
      authorCommits[l.source] = (authorCommits[l.source] ?? 0) + l.commits;
      repoCommits[l.target]   = (repoCommits[l.target]   ?? 0) + l.commits;
    }

    const nodes = [
      ...Object.entries(authorCommits).map(([id, commits]) => ({ id, type: 'author', commits })),
      ...Object.entries(repoCommits)  .map(([id, commits]) => ({ id, type: 'repo',   commits })),
    ];

    return { nodes, links };
  });

  return { timelineData, dataLoaded, dataError, dateInfo, graphData, loadTimelineData };
});
