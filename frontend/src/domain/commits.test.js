import { describe, it, expect } from 'vitest';
import { mergeCommits, mergeDateRanges } from './commits.js';

const c = (repo, commitHash, filePath = null) => ({ author: 'dev', repo, commitHash, date: '2024-01-01', filePath });

// ── mergeCommits ──────────────────────────────────────────────────────────────

describe('mergeCommits', () => {
  it('appends non-duplicate commits to an empty base', () => {
    const result = mergeCommits([], [c('A', 'abc'), c('A', 'def')]);
    expect(result).toHaveLength(2);
  });

  it('does not modify the existing array', () => {
    const existing = [c('A', 'abc')];
    mergeCommits(existing, [c('A', 'def')]);
    expect(existing).toHaveLength(1);
  });

  it('deduplicates by repo + commitHash + filePath', () => {
    const existing = [c('A', 'abc', 'src/x.ts')];
    const incoming = [c('A', 'abc', 'src/x.ts'), c('A', 'abc', 'src/y.ts')];
    const result = mergeCommits(existing, incoming);
    expect(result).toHaveLength(2); // existing + the new filePath only
  });

  it('treats the same commitHash with different filePaths as distinct rows', () => {
    const result = mergeCommits([], [c('A', 'abc', 'x.ts'), c('A', 'abc', 'y.ts')]);
    expect(result).toHaveLength(2);
  });

  it('treats commits from different repos as distinct even with the same hash', () => {
    const result = mergeCommits([c('A', 'abc')], [c('B', 'abc')]);
    expect(result).toHaveLength(2);
  });

  it('treats null and missing filePath as equivalent dedup keys', () => {
    const existing = [c('A', 'abc', null)];
    const incoming = [c('A', 'abc', null)];
    expect(mergeCommits(existing, incoming)).toHaveLength(1);
  });

  it('returns existing unchanged when incoming is empty', () => {
    const existing = [c('A', 'abc')];
    expect(mergeCommits(existing, [])).toEqual(existing);
  });

  it('returns incoming when existing is empty and there are no duplicates within incoming', () => {
    const incoming = [c('A', 'abc'), c('B', 'def')];
    expect(mergeCommits([], incoming)).toHaveLength(2);
  });

  it('deduplicates within incoming itself', () => {
    const dup = c('A', 'abc');
    expect(mergeCommits([], [dup, dup])).toHaveLength(1);
  });
});

// ── mergeDateRanges ───────────────────────────────────────────────────────────

describe('mergeDateRanges', () => {
  it('returns null when given an empty array', () => {
    expect(mergeDateRanges([])).toBeNull();
  });

  it('returns null when all ranges are null', () => {
    expect(mergeDateRanges([null, null])).toBeNull();
  });

  it('returns the single range when there is only one', () => {
    expect(mergeDateRanges([{ since: '2024-01-01', until: '2024-06-30' }]))
      .toEqual({ since: '2024-01-01', until: '2024-06-30' });
  });

  it('picks the earliest since and latest until across ranges', () => {
    const result = mergeDateRanges([
      { since: '2024-03-01', until: '2024-06-30' },
      { since: '2024-01-01', until: '2024-12-31' },
    ]);
    expect(result).toEqual({ since: '2024-01-01', until: '2024-12-31' });
  });

  it('skips null entries in the array', () => {
    const result = mergeDateRanges([null, { since: '2024-01-01', until: '2024-06-30' }, null]);
    expect(result).toEqual({ since: '2024-01-01', until: '2024-06-30' });
  });

  it('handles ranges with only a since bound', () => {
    const result = mergeDateRanges([{ since: '2024-01-01', until: null }]);
    expect(result).toEqual({ since: '2024-01-01', until: null });
  });

  it('handles ranges with only an until bound', () => {
    const result = mergeDateRanges([{ since: null, until: '2024-12-31' }]);
    expect(result).toEqual({ since: null, until: '2024-12-31' });
  });
});
