import { describe, it, expect } from 'vitest';
import { formatTooltipDetail } from './tooltipFormatters.js';

const noTeam = () => undefined;
const getTeam = id => ({ 'team-a': 'Alpha', 'team-b': 'Beta' }[id]);

function node(overrides) {
  return {
    type: 'author', commits: 100, contextCount: 0, authorCount: 0,
    context: '', teamName: '', pct: null, owningTeamId: null,
    ...overrides,
  };
}

// ── team ──────────────────────────────────────────────────────────────────────

describe('formatTooltipDetail — team', () => {
  it('uses singular "context" and "dev" when counts are 1', () => {
    const result = formatTooltipDetail(node({ type: 'team', contextCount: 1, authorCount: 1 }), noTeam);
    expect(result).toBe('Team · 1 context · 1 dev · 100 commits');
  });

  it('uses plural "contexts" and "devs" when counts are > 1', () => {
    const result = formatTooltipDetail(node({ type: 'team', contextCount: 3, authorCount: 5 }), noTeam);
    expect(result).toBe('Team · 3 contexts · 5 devs · 100 commits');
  });
});

// ── team-collapsed ────────────────────────────────────────────────────────────

describe('formatTooltipDetail — team-collapsed', () => {
  it('says "commits at this level" in folder context', () => {
    const result = formatTooltipDetail(
      node({ type: 'team-collapsed', authorCount: 2, context: 'folder' }), noTeam,
    );
    expect(result).toBe('2 devs · 100 commits at this level · click to expand');
  });

  it('says plain commits outside folder context', () => {
    const result = formatTooltipDetail(
      node({ type: 'team-collapsed', authorCount: 2, context: '' }), noTeam,
    );
    expect(result).toBe('2 devs · 100 commits · click to expand');
  });

  it('uses singular "dev" when authorCount is 1', () => {
    const result = formatTooltipDetail(
      node({ type: 'team-collapsed', authorCount: 1 }), noTeam,
    );
    expect(result).toMatch(/^1 dev /);
  });
});

// ── folder ────────────────────────────────────────────────────────────────────

describe('formatTooltipDetail — folder', () => {
  it('returns just the commit count', () => {
    expect(formatTooltipDetail(node({ type: 'folder', commits: 42 }), noTeam))
      .toBe('42 commits');
  });
});

// ── context ───────────────────────────────────────────────────────────────────

describe('formatTooltipDetail — context', () => {
  it('appends the owning team name when found', () => {
    const result = formatTooltipDetail(
      node({ type: 'context', commits: 200, owningTeamId: 'team-a' }), getTeam,
    );
    expect(result).toBe('200 commits · Alpha');
  });

  it('omits team name when owningTeamId is null', () => {
    const result = formatTooltipDetail(
      node({ type: 'context', commits: 200, owningTeamId: null }), getTeam,
    );
    expect(result).toBe('200 commits');
  });

  it('omits team name when getTeamName returns undefined', () => {
    const result = formatTooltipDetail(
      node({ type: 'context', commits: 200, owningTeamId: 'unknown' }), getTeam,
    );
    expect(result).toBe('200 commits');
  });
});

// ── author / default fallback ─────────────────────────────────────────────────

describe('formatTooltipDetail — author / default', () => {
  it('shows pct% when pct is set and context is not folder', () => {
    const result = formatTooltipDetail(node({ pct: 42 }), noTeam);
    expect(result).toBe('42%');
  });

  it('shows folder pct label when context is folder', () => {
    const result = formatTooltipDetail(node({ pct: 33, context: 'folder' }), noTeam);
    expect(result).toBe("33% of this level's commits");
  });

  it('falls back to commit count when pct is null', () => {
    const result = formatTooltipDetail(node({ pct: null, commits: 77 }), noTeam);
    expect(result).toBe('77 commits');
  });

  it('appends team name when teamName is set', () => {
    const result = formatTooltipDetail(node({ pct: 10, teamName: 'Alpha' }), noTeam);
    expect(result).toBe('10% · Alpha');
  });

  it('omits team name suffix when teamName is empty', () => {
    const result = formatTooltipDetail(node({ pct: 10, teamName: '' }), noTeam);
    expect(result).toBe('10%');
  });
});
