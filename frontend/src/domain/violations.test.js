import { describe, it, expect } from 'vitest';
import { exceedsThreshold, isContextViolating } from './violations.js';

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
