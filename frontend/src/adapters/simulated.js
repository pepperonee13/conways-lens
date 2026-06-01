const SIM_AUTHORS = [
  'Alice', 'Bob', 'Carlos', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry',
  'Iris', 'Jake', 'Karen', 'Liam', 'Mia', 'Noah', 'Olivia', 'Pete',
  'Quinn', 'Rachel', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yara', 'Zoe',
];

const SIM_REPOS = [
  'api-gateway', 'auth-service', 'payment-service', 'user-service',
  'notification-service', 'billing-service', 'search-service', 'analytics-service',
  'admin-portal', 'mobile-bff', 'data-pipeline', 'reporting-service',
  'inventory-service', 'order-service', 'shipping-service', 'catalog-service',
  'recommendation-engine', 'messaging-service', 'file-storage', 'config-service',
];

const SIM_FILE_PATHS = [
  'src/handlers/index.js', 'src/handlers/health.js',
  'src/models/schema.js', 'src/models/validators.js',
  'src/utils/helpers.js', 'src/utils/logger.js',
  'src/config/settings.js', 'src/config/constants.js',
  'src/middleware/auth.js', 'src/middleware/errors.js',
  'src/routes/index.js', 'src/routes/v1.js',
  'src/services/client.js', 'src/services/cache.js',
  'tests/unit/handlers.test.js', 'tests/unit/models.test.js',
  'tests/integration/api.test.js',
  'docs/openapi.yaml',
];

const TEAM_NAMES = ['Alpha', 'Beta', 'Gamma'];

export function generateSimulatedData({ authorCount, repoCount, minCommits, maxCommits, colors }) {
  const authors = SIM_AUTHORS.slice(0, authorCount);
  const repos   = SIM_REPOS.slice(0, repoCount);
  const now     = new Date();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const msRange = now - yearAgo;

  const rows = [];
  let shaSeq = 0;
  for (const author of authors) {
    for (const repo of repos) {
      if (Math.random() > 0.38) continue; // ~38% of author/repo pairs are active
      const count = minCommits + Math.floor(Math.random() * (maxCommits - minCommits + 1));
      for (let i = 0; i < count; i++) {
        const date     = new Date(yearAgo.getTime() + Math.random() * msRange);
        const sha      = (++shaSeq).toString(16).padStart(8, '0') + Math.random().toString(16).slice(2, 10);
        const filePath = SIM_FILE_PATHS[Math.floor(Math.random() * SIM_FILE_PATHS.length)];
        rows.push({ author, repo, commitHash: sha, date: date.toISOString().slice(0, 10), filePath });
      }
    }
  }

  const teamCount = Math.min(3, authorCount, repoCount);
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    id:       `sim-team-${i}`,
    name:     TEAM_NAMES[i],
    color:    colors[i],
    authors:  authors.filter((_, j) => j % teamCount === i),
    contexts: repos.filter((_, j) => j % teamCount === i),
  }));

  const dateInfo = {
    since: yearAgo.toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
  };

  return { rows, teams, dateInfo };
}
