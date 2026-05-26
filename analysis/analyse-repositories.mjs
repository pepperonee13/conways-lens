#!/usr/bin/env node
// Parallel git-history scraper for ConwayLens.
//
// Drop-in alternative to Analyse-Repositories.ps1 for large repository sets.
// Same CSV schema and metadata footer.
//
// Usage:
//   node analysis/analyse-repositories.mjs
//   node analysis/analyse-repositories.mjs --since 2024-01-01 --until 2024-12-31
//   node analysis/analyse-repositories.mjs --repos team-a-repos.json --output team-a.csv
//   node analysis/analyse-repositories.mjs --concurrency 8 --workdir /tmp/repos

import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

const args = parseArgs(process.argv.slice(2));

const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

const since       = args.since   ?? isoDate(oneYearAgo);
const until       = args.until   ?? isoDate(new Date());
const reposFile   = resolve(args.repos    ?? join(__dirname, 'repos.json'));
const workDir     = resolve(args.workdir  ?? join(tmpdir(), 'conwaylens-repos'));
const concurrency = Math.max(1, parseInt(args.concurrency ?? '4', 10));
const outputFile  = resolve(
  args.output ?? join(__dirname, '..', 'app', 'public', `TimelineData-${basename(reposFile, '.json')}.csv`)
);

// ---------------------------------------------------------------------------
// Validate inputs
// ---------------------------------------------------------------------------
if (!existsSync(reposFile)) {
  console.error(`repos.json not found at: ${reposFile}`);
  process.exit(1);
}

let repos;
try {
  repos = JSON.parse(readFileSync(reposFile, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${reposFile}: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(repos) || repos.length === 0) {
  console.error('repos.json is empty — add at least one repository.');
  process.exit(1);
}

await mkdir(workDir, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function git(args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('git', args, { cwd: opts.cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
    proc.on('error', rejectP);
    proc.on('close', code => {
      if (code === 0) resolveP({ stdout, stderr });
      else rejectP(new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`));
    });
  });
}

const STATUS_MAP = { M: 'edit', A: 'add', D: 'delete', R: 'rename', C: 'copy' };

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLS = ['Date', 'DateTime', 'Product', 'Author', 'ChangesetId', 'ChangeType', 'FilePath', 'Source', 'CommitMessage'];

async function processRepo(repo) {
  const repoName = repo.name;
  const repoUrl  = repo.url;
  const branch   = repo.branch || 'main';
  const local    = join(workDir, repoName);
  const tag      = `[${repoName}]`;
  const rows     = [];

  try {
    const hasGit = await access(join(local, '.git')).then(() => true, () => false);
    if (hasGit) {
      console.log(`${tag} updating...`);
      await git(['fetch', 'origin', branch, '--quiet'], { cwd: local });
      await git(['checkout', branch, '--quiet'], { cwd: local });
      await git(['reset', '--hard', `origin/${branch}`, '--quiet'], { cwd: local });
    } else {
      console.log(`${tag} cloning...`);
      await git(['clone', '--branch', branch, '--single-branch', repoUrl, local]);
    }

    const { stdout } = await git([
      'log', branch,
      `--since=${since}`,
      `--until=${until}`,
      '--date=iso',
      '--pretty=format:COMMIT|%H|%an|%ad|%s',
      '--name-status',
    ], { cwd: local });

    let cur = null;
    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.trimEnd();
      if (!line) continue;

      if (line.startsWith('COMMIT|')) {
        const parts = line.split('|');
        const hash    = parts[1] ?? '';
        const author  = parts[2] ?? '';
        const rawDate = parts[3] ?? '';
        const message = parts.slice(4).join('|'); // commit subject may contain '|'
        let date    = rawDate.slice(0, 10);
        let dateStr = rawDate;
        const dt = new Date(rawDate);
        if (!isNaN(dt.getTime())) {
          date    = isoDate(dt);
          dateStr = `${date} ${dt.toISOString().slice(11, 19)}`;
        }
        cur = { hash, author, date, dateStr, message };
        continue;
      }

      const m = line.match(/^([MADRCTU])\S*\s+(.+)$/);
      if (cur && m) {
        const filePath = m[2].split('\t').pop().trim();
        rows.push([
          cur.date, cur.dateStr, repoName, cur.author, cur.hash,
          STATUS_MAP[m[1]] ?? 'edit', filePath, 'git', cur.message,
        ]);
      }
    }

    console.log(`${tag} done — ${rows.length} file-commit rows.`);
    return rows;
  } catch (err) {
    console.warn(`${tag} skipped: ${err.message}`);
    return [];
  }
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log(`ConwayLens — analysing ${repos.length} repositories with concurrency=${concurrency}`);
console.log(`Date range : ${since} → ${until}`);
console.log(`Work dir   : ${workDir}`);
console.log(`Output     : ${outputFile}\n`);

const start = Date.now();
const allRows = (await runPool(repos, concurrency, processRepo)).flat();

if (allRows.length === 0) {
  console.warn('\nNo data extracted. Check that the repositories are accessible and have commits in the given date range.');
  process.exit(0);
}

await mkdir(dirname(outputFile), { recursive: true });

const csvLines = [COLS.join(',')];
for (const row of allRows) csvLines.push(row.map(csvEscape).join(','));
csvLines.push(`Since=${since},Until=${until}`);

await writeFile(outputFile, csvLines.join('\n') + '\n', 'utf8');

const seconds = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n=== Done ===`);
console.log(`Total rows : ${allRows.length}`);
console.log(`Elapsed    : ${seconds}s`);
console.log(`Output     : ${outputFile}`);
