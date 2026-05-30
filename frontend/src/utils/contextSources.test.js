import { describe, it, expect } from 'vitest';
import { sameSource, contextForSource } from './contextSources.js';

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

  it('rejects path sources with different repos', () => {
    expect(sameSource(
      { type: 'path', repo: 'A', path: 'src' },
      { type: 'path', repo: 'B', path: 'src' },
    )).toBe(false);
  });

  it('matches identical glob sources', () => {
    const s = { type: 'glob', repo: 'A', pattern: '**/*.sql' };
    expect(sameSource(s, { ...s })).toBe(true);
  });

  it('rejects glob sources with different patterns', () => {
    expect(sameSource(
      { type: 'glob', repo: 'A', pattern: '**/*.sql' },
      { type: 'glob', repo: 'A', pattern: '**/*.ts' },
    )).toBe(false);
  });

  it('rejects sources of different types even for the same repo', () => {
    expect(sameSource(
      { type: 'repo', repo: 'A' },
      { type: 'path', repo: 'A', path: '' },
    )).toBe(false);
  });
});

// ── contextForSource ──────────────────────────────────────────────────────────

const ctxA = { id: 'ctx-a', name: 'Auth',    sources: [{ type: 'repo', repo: 'auth' }] };
const ctxB = { id: 'ctx-b', name: 'Billing', sources: [{ type: 'path', repo: 'mono', path: 'billing' }] };
const ctxC = { id: 'ctx-c', name: 'Infra',   sources: [{ type: 'glob', repo: 'mono', pattern: 'infra/**' }] };
const contexts = [ctxA, ctxB, ctxC];

describe('contextForSource', () => {
  it('finds the owner of a repo source', () => {
    expect(contextForSource({ type: 'repo', repo: 'auth' }, contexts)).toBe(ctxA);
  });

  it('finds the owner of a path source', () => {
    expect(contextForSource({ type: 'path', repo: 'mono', path: 'billing' }, contexts)).toBe(ctxB);
  });

  it('finds the owner of a glob source', () => {
    expect(contextForSource({ type: 'glob', repo: 'mono', pattern: 'infra/**' }, contexts)).toBe(ctxC);
  });

  it('returns null for an unclaimed source', () => {
    expect(contextForSource({ type: 'repo', repo: 'payments' }, contexts)).toBeNull();
  });

  it('returns null for a path not yet assigned', () => {
    expect(contextForSource({ type: 'path', repo: 'mono', path: 'frontend' }, contexts)).toBeNull();
  });

  it('returns null when the contexts array is empty', () => {
    expect(contextForSource({ type: 'repo', repo: 'auth' }, [])).toBeNull();
  });

  it('does not confuse a path source with a repo source for the same repo', () => {
    expect(contextForSource({ type: 'path', repo: 'auth', path: 'src' }, contexts)).toBeNull();
  });

  it('does not confuse sources across repos with identical paths', () => {
    const ctxX = { id: 'ctx-x', name: 'X', sources: [{ type: 'path', repo: 'X', path: 'src' }] };
    expect(contextForSource({ type: 'path', repo: 'Y', path: 'src' }, [ctxX])).toBeNull();
  });

  it('returns the first matching context when duplicates exist in data', () => {
    const dupe = { id: 'ctx-d', name: 'Dupe', sources: [{ type: 'repo', repo: 'auth' }] };
    expect(contextForSource({ type: 'repo', repo: 'auth' }, [ctxA, dupe])).toBe(ctxA);
  });
});
