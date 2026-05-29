import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { LensPage }  from './lens-page.mjs';

const OUT  = 'out';
const CSV  = 'playwright/TimelineData.csv';
const JSON = 'playwright/mappings.json';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);

await lens.loadCSV(CSV);
await lens.screenshot(`${OUT}/01-no-teams.png`);
console.log('✓ 01-no-teams.png');

await lens.importMappings(JSON);
await lens.screenshot(`${OUT}/02-teams-collapsed.png`);
console.log('✓ 02-teams-collapsed.png');

await lens.expandNode('Backend');
await lens.screenshot(`${OUT}/03-backend-expanded.png`);
console.log('✓ 03-backend-expanded.png');

for (const name of ['Frontend', 'Data', 'Platform']) {
  await lens.expandNode(name);
}
await lens.screenshot(`${OUT}/04-all-expanded.png`);
console.log('✓ 04-all-expanded.png');

await lens.collapseNode('Backend');
await lens.screenshot(`${OUT}/05-backend-collapsed.png`);
console.log('✓ 05-backend-collapsed.png');

await browser.close();
console.log('\nAll screenshots saved to out/');
