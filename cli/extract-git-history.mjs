#!/usr/bin/env node
// Extracts git commit history from one or more repositories into a CSV for ConwayLens.
// Clones/updates repos in parallel, then emits one row per file per commit.
// Cross-platform alternative to extract-git-history.ps1 with parallel execution.
//
// Usage:
//   node cli/extract-git-history.mjs
//   node cli/extract-git-history.mjs --since 2024-01-01 --until 2024-12-31
//   node cli/extract-git-history.mjs --repos team-a-repos.json --output team-a.csv
//   node cli/extract-git-history.mjs --concurrency 8 --workdir /tmp/repos

import { spawn } from 'node:child_process';
import { mkdir, writeFile, access, readdir, rm } from 'node:fs/promises';
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
  args.output ?? join(__dirname, '..', 'frontend', 'public', `CommitHistory-${basename(reposFile, '.json')}.csv`)
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
const COLORS = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
};
const useColor = process.stdout.isTTY;
const c = (color, s) => (useColor ? `${COLORS[color]}${s}${COLORS.reset}` : s);

// Per-repo output buffer — flushed as a block when the repo finishes, so
// parallel runs don't interleave the multi-line log groups.
function makeLogger() {
  const lines = [];
  return {
    line: (s = '') => lines.push(s),
    flush: () => { if (lines.length) console.log(lines.join('\n')); },
  };
}

function gitRaw(args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('git', args, { cwd: opts.cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
    proc.on('error', rejectP);
    proc.on('close', code => {
      if (code === 0) resolveP({ stdout, stderr });
      else {
        const err = new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`);
        err.stderr = stderr;
        err.code   = code;
        rejectP(err);
      }
    });
  });
}

const STALE_LOCK_PATTERNS = [
  /Unable to create.*\.lock['"]?: File exists/i,
  /index\.lock.*exists/i,
  /Another git process seems to be running/i,
];

async function clearStaleLocks(repoDir) {
  const gitDir = join(repoDir, '.git');
  const cleared = [];
  if (!existsSync(gitDir)) return cleared;
  try {
    const entries = await readdir(gitDir);
    for (const name of entries) {
      if (name.endsWith('.lock')) {
        await rm(join(gitDir, name), { force: true });
        cleared.push(name);
      }
    }
  } catch { /* ignore */ }
  return cleared;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Run a git command with retries. On stale-lock errors, clear *.lock files
// in .git/ between attempts. Uses exponential backoff (500ms, 1s, 2s, …).
async function git(args, opts = {}) {
  const { cwd, log, attempts = 4, label } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await gitRaw(args, { cwd });
    } catch (err) {
      lastErr = err;
      const isLock = STALE_LOCK_PATTERNS.some(re => re.test(err.stderr ?? ''));
      const willRetry = attempt < attempts;
      if (log) {
        const what = label ?? `git ${args[0]}`;
        const reason = isLock ? 'stale lock file' : `exit ${err.code}`;
        log.line(c('yellow', `    ${what} failed (${reason}) — attempt ${attempt}/${attempts}${willRetry ? ', retrying...' : ''}`));
      }
      if (!willRetry) break;
      if (isLock && cwd) {
        const cleared = await clearStaleLocks(cwd);
        if (cleared.length && log) {
          log.line(c('gray',   `    Removed stale lock(s): ${cleared.join(', ')}`));
        }
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

const STATUS_MAP = { M: 'edit', A: 'add', D: 'delete', R: 'rename', C: 'copy' };

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLS = ['Date', 'DateTime', 'RepoName', 'RepoUrl', 'Author', 'CommitHash', 'ChangeType', 'FilePath', 'CommitMessage'];

async function processRepo(repo) {
  const repoName = repo.name;
  const repoUrl  = repo.url;
  const branch   = repo.branch ?? null;
  const local    = join(workDir, repoName);
  const rows     = [];
  const log      = makeLogger();

  log.line('');
  log.line(c('cyan', `=== ${repoName} ===`));
  log.line(`    URL   : ${repoUrl}`);
  if (branch) log.line(`    Branch: ${branch}`);
  log.line(`    Local : ${local}`);

  try {
    const hasGit = await access(join(local, '.git')).then(() => true, () => false);
    if (hasGit) {
      log.line(c('gray', '    Pulling latest changes...'));
      const ref = branch ?? 'HEAD';
      await git(['fetch', 'origin', ref, '--quiet'], { cwd: local, log, label: 'git fetch' });
      await git(['checkout', ref, '--quiet'],         { cwd: local, log, label: 'git checkout' });
      if (branch) await git(['reset', '--hard', `origin/${branch}`, '--quiet'], { cwd: local, log, label: 'git reset' });
    } else {
      log.line(c('gray', '    Cloning...'));
      const branchArgs = branch ? ['--branch', branch, '--single-branch'] : [];
      await git(['clone', ...branchArgs, repoUrl, local], { log, label: 'git clone' });
    }

    log.line(c('gray', `    Extracting history since ${since}...`));
    const { stdout } = await git([
      'log', branch ?? 'HEAD',
      `--since=${since}`,
      `--until=${until}`,
      '--date=iso',
      '--pretty=format:COMMIT|%H|%an|%ad|%s',
      '--name-status',
    ], { cwd: local, log, label: 'git log' });

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
          cur.date, cur.dateStr, repoName, repoUrl, cur.author, cur.hash,
          STATUS_MAP[m[1]] ?? 'edit', filePath, cur.message,
        ]);
      }
    }

    log.line(c('green', `    Done — ${rows.length} file-commit rows extracted.`));
    log.flush();
    return rows;
  } catch (err) {
    log.line(c('red', `    Failed: ${repoName} — ${err.message}`));
    log.flush();
    process.exit(1);
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
  console.error('\nNo data extracted. Check that the repositories are accessible and have commits in the given date range.');
  process.exit(1);
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
