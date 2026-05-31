import { describe, it, expect } from 'vitest';
import { sameSource, matchesSource, sourcesOverlap, contextForSource, resolveContextId } from './contextSources.js';

// ── sameSource ────────────────────────────────────────────────────────────────

describe('sameSource', () => {
  it('matches identical repo sources', () => {
    expect(sameSource({ type: 'repo', repo: 'A' }, { type: 'repo', repo: 'A' })).toBe(true);
  });

  it('rejects repo sources from different repos', () => {
    expect(sameSource({ type: 'repo', repo: 'A' }, { type: 'repo', repo: 'B' })).toBe(false);
  });

  it('matches identical path sources', () => {
    const s = { type: 'path', repo: 'A', path: 'src/auth' };
    expect(sameSource(s, { ...s })).toBe(true);
  });

  it('rejects path sources with different paths', () => {
    expect(sameSource(
      { type: 'path', repo: 'A', path: 'src/auth' },
      { type: 'path', repo: 'A', path: 'src/billing' },
    )).toBe(false);
  });

  it('matches identical glob sources', () => {
    const s = { type: 'glob', repo: 'A', pattern: '**/*.sql' };
    expect(sameSource(s, { ...s })).toBe(true);
  });

  it('rejects sources of different types for the same repo', () => {
    expect(sameSource(
      { type: 'repo', repo: 'A' },
      { type: 'path', repo: 'A', path: '' },
    )).toBe(false);
  });
});

// ── matchesSource ─────────────────────────────────────────────────────────────

describe('matchesSource', () => {
  it('repo source matches any file path', () => {
    expect(matchesSource({ type: 'repo', repo: 'A' }, 'src/anything.ts')).toBe(true);
    expect(matchesSource({ type: 'repo', repo: 'A' }, '')).toBe(true);
  });

  it('path source matches exact path', () => {
    expect(matchesSource({ type: 'path', repo: 'A', path: 'src' }, 'src')).toBe(true);
  });

  it('path source matches children', () => {
    expect(matchesSource({ type: 'path', repo: 'A', path: 'src' }, 'src/auth.ts')).toBe(true);
    expect(matchesSource({ type: 'path', repo: 'A', path: 'src' }, 'src/auth/index.ts')).toBe(true);
  });

  it('path source does not match a sibling prefix', () => {
    expect(matchesSource({ type: 'path', repo: 'A', path: 'src' }, 'src2/foo.ts')).toBe(false);
  });

  it('glob source matches the pattern', () => {
    expect(matchesSource({ type: 'glob', repo: 'A', pattern: '**/*.ts' }, 'src/auth.ts')).toBe(true);
    expect(matchesSource({ type: 'glob', repo: 'A', pattern: '**/*.ts' }, 'root.ts')).toBe(true);
  });

  it('glob source does not match outside the pattern', () => {
    expect(matchesSource({ type: 'glob', repo: 'A', pattern: 'infra/**' }, 'src/auth.ts')).toBe(false);
  });
});

// ── sourcesOverlap ────────────────────────────────────────────────────────────

describe('sourcesOverlap', () => {
  it('returns false for sources in different repos', () => {
    expect(sourcesOverlap(
      { type: 'repo', repo: 'A' },
      { type: 'repo', repo: 'B' },
    )).toBe(false);
  });

  it('identical sources always overlap without needing file data', () => {
    const s = { type: 'glob', repo: 'A', pattern: '**/*.ts' };
    expect(sourcesOverlap(s, { ...s })).toBe(true);
  });

  it('repo source overlaps with any source in the same repo', () => {
    expect(sourcesOverlap(
      { type: 'repo',  repo: 'A' },
      { type: 'path',  repo: 'A', path: 'src' },
    )).toBe(true);
    expect(sourcesOverlap(
      { type: 'glob',  repo: 'A', pattern: '**/*.ts' },
      { type: 'repo',  repo: 'A' },
    )).toBe(true);
  });

  it('path sources overlap when one is a prefix of the other', () => {
    expect(sourcesOverlap(
      { type: 'path', repo: 'A', path: 'src' },
      { type: 'path', repo: 'A', path: 'src/auth' },
    )).toBe(true);
  });

  it('path sources with unrelated paths do not overlap', () => {
    expect(sourcesOverlap(
      { type: 'path', repo: 'A', path: 'src' },
      { type: 'path', repo: 'A', path: 'infra' },
    )).toBe(false);
  });

  it('path sibling-prefix is not treated as prefix overlap', () => {
    // 'src2' starts with 'src' but 'src2' is not under 'src/'
    expect(sourcesOverlap(
      { type: 'path', repo: 'A', path: 'src' },
      { type: 'path', repo: 'A', path: 'src2' },
    )).toBe(false);
  });

  it('glob sources overlap when a real file matches both — injected via getFilePaths', () => {
    const files = ['infra/db.sql', 'src/auth.ts'];
    const getFilePaths = () => files;
    expect(sourcesOverlap(
      { type: 'glob', repo: 'A', pattern: '**/*.sql' },
      { type: 'glob', repo: 'A', pattern: 'infra/**' },
      getFilePaths,
    )).toBe(true);
  });

  it('glob sources return false when no real file matches both', () => {
    const files = ['src/auth.ts'];
    const getFilePaths = () => files;
    expect(sourcesOverlap(
      { type: 'glob', repo: 'A', pattern: '**/*.sql' },
      { type: 'glob', repo: 'A', pattern: 'infra/**' },
      getFilePaths,
    )).toBe(false);
  });

  it('glob vs path overlap detected via injected file paths', () => {
    const files = ['infra/schema.sql', 'src/auth.ts'];
    const getFilePaths = () => files;
    expect(sourcesOverlap(
      { type: 'glob', repo: 'A', pattern: '**/*.sql' },
      { type: 'path', repo: 'A', path: 'infra' },
      getFilePaths,
    )).toBe(true);
  });

  it('defaults to no overlap for glob sources when no file paths are injected', () => {
    expect(sourcesOverlap(
      { type: 'glob', repo: 'A', pattern: '**/*.sql' },
      { type: 'glob', repo: 'A', pattern: 'infra/**' },
      // no getFilePaths — glob overlap can't be determined without real data
    )).toBe(false);
  });

  it('getFilePaths is called with the correct repo', () => {
    let capturedRepo;
    const getFilePaths = (repo) => { capturedRepo = repo; return []; };
    sourcesOverlap(
      { type: 'glob', repo: 'my-repo', pattern: '**/*.ts' },
      { type: 'glob', repo: 'my-repo', pattern: 'src/**' },
      getFilePaths,
    );
    expect(capturedRepo).toBe('my-repo');
  });
});

// ── contextForSource ──────────────────────────────────────────────────────────

const ctxA = { id: 'ctx-a', name: 'Auth',    sources: [{ type: 'repo', repo: 'auth' }] };
const ctxB = { id: 'ctx-b', name: 'Billing', sources: [{ type: 'path', repo: 'mono', path: 'billing' }] };
const ctxC = { id: 'ctx-c', name: 'Infra',   sources: [{ type: 'glob', repo: 'mono', pattern: 'infra/**' }] };
const contexts = [ctxA, ctxB, ctxC];

describe('contextForSource', () => {
  it('finds the owner of an exact repo source', () => {
    expect(contextForSource({ type: 'repo', repo: 'auth' }, contexts)).toBe(ctxA);
  });

  it('finds the owner of an exact path source', () => {
    expect(contextForSource({ type: 'path', repo: 'mono', path: 'billing' }, contexts)).toBe(ctxB);
  });

  it('finds the owner of an exact glob source', () => {
    expect(contextForSource({ type: 'glob', repo: 'mono', pattern: 'infra/**' }, contexts)).toBe(ctxC);
  });

  it('returns null for a source in a repo not yet claimed', () => {
    expect(contextForSource({ type: 'repo', repo: 'payments' }, contexts)).toBeNull();
  });

  it('returns null for an unrelated path in the same repo', () => {
    expect(contextForSource({ type: 'path', repo: 'mono', path: 'frontend' }, contexts)).toBeNull();
  });

  it('returns null when the contexts array is empty', () => {
    expect(contextForSource({ type: 'repo', repo: 'auth' }, [])).toBeNull();
  });

  it('detects overlap: path source conflicts with a repo source for the same repo', () => {
    // auth is wholly owned by ctxA — a sub-path of auth cannot go into another context
    expect(contextForSource({ type: 'path', repo: 'auth', path: 'src' }, contexts)).toBe(ctxA);
  });

  it('detects overlap: child path conflicts with an existing parent path', () => {
    const ctxParent = { id: 'p', name: 'Parent', sources: [{ type: 'path', repo: 'X', path: 'src' }] };
    expect(contextForSource({ type: 'path', repo: 'X', path: 'src/auth' }, [ctxParent])).toBe(ctxParent);
  });

  it('detects overlap: glob source conflicts with repo source via short-circuit', () => {
    expect(contextForSource({ type: 'glob', repo: 'auth', pattern: '**/*.ts' }, contexts)).toBe(ctxA);
  });

  it('detects overlap: glob source conflicts with another glob via injected file paths', () => {
    const files = { mono: ['infra/db.sql', 'infra/setup.sh'] };
    const getFilePaths = (repo) => files[repo] ?? [];
    expect(contextForSource(
      { type: 'glob', repo: 'mono', pattern: 'infra/*.sql' },
      contexts,
      getFilePaths,
    )).toBe(ctxC);
  });

  it('does not confuse sources across repos with identical paths', () => {
    const ctxX = { id: 'ctx-x', name: 'X', sources: [{ type: 'path', repo: 'X', path: 'src' }] };
    expect(contextForSource({ type: 'path', repo: 'Y', path: 'src' }, [ctxX])).toBeNull();
  });

  it('returns the first conflicting context when multiple match', () => {
    const dupe = { id: 'ctx-d', name: 'Dupe', sources: [{ type: 'repo', repo: 'auth' }] };
    expect(contextForSource({ type: 'repo', repo: 'auth' }, [ctxA, dupe])).toBe(ctxA);
  });
});

// ── resolveContextId ──────────────────────────────────────────────────────────

const auth  = { id: 'ctx-auth',    sources: [{ type: 'repo', repo: 'auth' }] };
const front = { id: 'ctx-front',   sources: [{ type: 'path', repo: 'mono', path: 'frontend' }] };
const back  = { id: 'ctx-back',    sources: [{ type: 'path', repo: 'mono', path: 'backend' }] };
const api   = { id: 'ctx-api',     sources: [{ type: 'path', repo: 'mono', path: 'backend/api' }] };
const sql   = { id: 'ctx-sql',     sources: [{ type: 'glob', repo: 'mono', pattern: '**/*.sql' }] };

describe('resolveContextId', () => {
  it('returns the context id when a repo source matches', () => {
    expect(resolveContextId('auth', 'src/login.ts', [auth])).toBe('ctx-auth');
  });

  it('returns null when no user-defined context matches (auto-context fallback is caller\'s job)', () => {
    expect(resolveContextId('payments', 'src/pay.ts', [auth])).toBeNull();
  });

  it('returns null for an empty context list', () => {
    expect(resolveContextId('auth', 'anything', [])).toBeNull();
  });

  it('matches a path source on the exact path', () => {
    expect(resolveContextId('mono', 'frontend', [front, back])).toBe('ctx-front');
  });

  it('matches a path source on a child path', () => {
    expect(resolveContextId('mono', 'frontend/App.vue', [front, back])).toBe('ctx-front');
  });

  it('does not match a path source on a sibling prefix (src vs src2)', () => {
    const ctx = { id: 'ctx-src', sources: [{ type: 'path', repo: 'A', path: 'src' }] };
    expect(resolveContextId('A', 'src2/foo.ts', [ctx])).toBeNull();
  });

  it('path source beats repo source for the same repo (higher score)', () => {
    expect(resolveContextId('mono', 'frontend/App.vue', [auth, front, back])).toBe('ctx-front');
  });

  it('longer path beats shorter path when both match', () => {
    expect(resolveContextId('mono', 'backend/api/routes.ts', [back, api])).toBe('ctx-api');
  });

  it('glob source matches the pattern', () => {
    expect(resolveContextId('mono', 'db/schema.sql', [front, sql])).toBe('ctx-sql');
  });

  it('glob source beats repo source', () => {
    const repoCtx = { id: 'ctx-whole', sources: [{ type: 'repo', repo: 'mono' }] };
    expect(resolveContextId('mono', 'db/schema.sql', [repoCtx, sql])).toBe('ctx-sql');
  });

  it('treats a null filePath the same as an empty string', () => {
    const rootFile = { id: 'ctx-root', sources: [{ type: 'path', repo: 'A', path: '' }] };
    expect(resolveContextId('A', null, [rootFile])).toBe('ctx-root');
  });

  it('does not match a context whose source is for a different repo', () => {
    expect(resolveContextId('other', 'src/x.ts', [auth, front])).toBeNull();
  });
});
