import { describe, it, expect } from 'vitest';
import { exceedsThreshold, isContextViolating, filterSignificantContributions } from './violations.js';

// ── exceedsThreshold ──────────────────────────────────────────────────────────

describe('exceedsThreshold', () => {
  it('returns true when external share equals the threshold exactly', () => {
    expect(exceedsThreshold(10, 100, 10)).toBe(true);
  });

  it('returns true when external share exceeds the threshold', () => {
    expect(exceedsThreshold(50, 100, 10)).toBe(true);
  });

  it('returns false when external share is below the threshold', () => {
    expect(exceedsThreshold(9, 100, 10)).toBe(false);
  });

  it('returns false when totalCommits is zero (avoids division by zero)', () => {
    expect(exceedsThreshold(0, 0, 10)).toBe(false);
  });

  it('works at threshold 0 — any external commit is a violation', () => {
    expect(exceedsThreshold(1, 100, 0)).toBe(true);
    expect(exceedsThreshold(0, 100, 0)).toBe(false);
  });

  it('works at threshold 100 — only a complete takeover violates', () => {
    expect(exceedsThreshold(99, 100, 100)).toBe(false);
    expect(exceedsThreshold(100, 100, 100)).toBe(true);
  });
});

// ── isContextViolating ────────────────────────────────────────────────────────

describe('isContextViolating', () => {
  const owningTeam   = 'team-a';
  const externalTeam = 'team-b';

  it('returns true when an external team exceeds the threshold', () => {
    const ctx = {
      commits: 100,
      owningTeamId: owningTeam,
      contributions: [
        { teamId: owningTeam,   commits: 80 },
        { teamId: externalTeam, commits: 20 },
      ],
    };
    expect(isContextViolating(ctx, 10)).toBe(true);
  });

  it('returns false when no external team exceeds the threshold', () => {
    const ctx = {
      commits: 100,
      owningTeamId: owningTeam,
      contributions: [
        { teamId: owningTeam,   commits: 95 },
        { teamId: externalTeam, commits: 5 },
      ],
    };
    expect(isContextViolating(ctx, 10)).toBe(false);
  });

  it('returns false when context has no commits', () => {
    const ctx = {
      commits: 0,
      owningTeamId: owningTeam,
      contributions: [{ teamId: externalTeam, commits: 0 }],
    };
    expect(isContextViolating(ctx, 10)).toBe(false);
  });

  it('returns false when all contributions are from the owning team', () => {
    const ctx = {
      commits: 100,
      owningTeamId: owningTeam,
      contributions: [{ teamId: owningTeam, commits: 100 }],
    };
    expect(isContextViolating(ctx, 10)).toBe(false);
  });

  it('returns false when contributions array is absent', () => {
    const ctx = { commits: 100, owningTeamId: owningTeam };
    expect(isContextViolating(ctx, 10)).toBe(false);
  });

  it('returns true when owningTeamId is null and any team contributes above threshold', () => {
    const ctx = {
      commits: 100,
      owningTeamId: null,
      contributions: [{ teamId: externalTeam, commits: 20 }],
    };
    expect(isContextViolating(ctx, 10)).toBe(true);
  });

  it('is sensitive to the threshold value', () => {
    const ctx = {
      commits: 100,
      owningTeamId: owningTeam,
      contributions: [{ teamId: externalTeam, commits: 15 }],
    };
    expect(isContextViolating(ctx, 10)).toBe(true);
    expect(isContextViolating(ctx, 20)).toBe(false);
  });
});

// ── filterSignificantContributions ────────────────────────────────────────────

describe('filterSignificantContributions', () => {
  const owner = 'team-a';
  const ext1  = 'team-b';
  const ext2  = 'team-c';

  it('returns [] when contributions is empty', () => {
    expect(filterSignificantContributions([], owner, 100, 10)).toEqual([]);
  });

  it('returns [] when total is zero', () => {
    const contribs = [{ teamId: owner, commits: 0 }];
    expect(filterSignificantContributions(contribs, owner, 0, 10)).toEqual([]);
  });

  it('always includes the owning team even when below threshold', () => {
    const contribs = [{ teamId: owner, commits: 5 }];
    const result = filterSignificantContributions(contribs, owner, 100, 10);
    expect(result).toHaveLength(1);
    expect(result[0].teamId).toBe(owner);
  });

  it('includes an external team whose share meets the threshold exactly', () => {
    const contribs = [{ teamId: ext1, commits: 10 }];
    const result = filterSignificantContributions(contribs, owner, 100, 10);
    expect(result).toHaveLength(1);
    expect(result[0].teamId).toBe(ext1);
  });

  it('excludes an external team whose share is below the threshold', () => {
    const contribs = [
      { teamId: owner, commits: 95 },
      { teamId: ext1,  commits: 5  },
    ];
    const result = filterSignificantContributions(contribs, owner, 100, 10);
    expect(result.map(r => r.teamId)).toEqual([owner]);
  });

  it('places the owning team first regardless of commit volume', () => {
    const contribs = [
      { teamId: ext1,  commits: 60 },
      { teamId: owner, commits: 40 },
    ];
    const result = filterSignificantContributions(contribs, owner, 100, 10);
    expect(result[0].teamId).toBe(owner);
    expect(result[1].teamId).toBe(ext1);
  });

  it('sorts non-owner teams by commit volume descending', () => {
    const contribs = [
      { teamId: owner, commits: 50 },
      { teamId: ext2,  commits: 20 },
      { teamId: ext1,  commits: 30 },
    ];
    const result = filterSignificantContributions(contribs, owner, 100, 10);
    expect(result.map(r => r.teamId)).toEqual([owner, ext1, ext2]);
  });

  it('does not mutate the input array', () => {
    const contribs = [
      { teamId: ext1,  commits: 60 },
      { teamId: owner, commits: 40 },
    ];
    const copy = [...contribs];
    filterSignificantContributions(contribs, owner, 100, 10);
    expect(contribs).toEqual(copy);
  });

  it('treats all teams as external when owningTeamId is null', () => {
    const contribs = [{ teamId: ext1, commits: 20 }];
    const result = filterSignificantContributions(contribs, null, 100, 10);
    expect(result).toHaveLength(1);
  });

  it('passes extra fields through unchanged', () => {
    const contribs = [{ teamId: owner, commits: 100, teamColor: '#f00', extra: true }];
    const result = filterSignificantContributions(contribs, owner, 100, 10);
    expect(result[0]).toMatchObject({ teamColor: '#f00', extra: true });
  });
});
