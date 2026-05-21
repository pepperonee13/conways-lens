---
description: Run the ConwayLens app and interact with it via Playwright using the LensPage page object model
---

# Run ConwayLens app

## Prerequisites

The dev server must already be running on port 5174:
```bash
cd app && npm run dev -- --port 5174 &
```

Or the production build preview:
```bash
cd app && npx vite build && npx vite preview --port 5174 &
```

Playwright is installed at `/opt/node22/lib/node_modules/playwright`.

## Page Object Model

All Playwright automation uses the `LensPage` class at `playwright/lens-page.mjs`.

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { LensPage }  from './playwright/lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);          // opens http://localhost:5174
```

### Available operations

| Method | What it does |
|--------|-------------|
| `await lens.loadCSV('sample-data/TimelineData.csv')` | Upload CSV via the Load file button |
| `await lens.importMappings('sample-data/mappings.json')` | Open Mapping panel, import JSON, close panel |
| `await lens.expandNode('Backend')` | Click a named SVG node to expand it; waits for simulation |
| `await lens.collapseNode('Backend')` | Click a named SVG node to collapse it; waits for simulation |
| `await lens.hoverNode('Backend')` | Hover over a node and return tooltip text |
| `await lens.screenshot('out/foo.png')` | Save a screenshot (path relative to repo root) |

### Full example

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { LensPage }  from './playwright/lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);

await lens.loadCSV('sample-data/TimelineData.csv');
await lens.importMappings('sample-data/mappings.json');
await lens.screenshot('out/01-loaded.png');

await lens.expandNode('Backend');
await lens.screenshot('out/02-backend-expanded.png');

const tip = await lens.hoverNode('backend-api');
console.log('tooltip:', tip);

await lens.collapseNode('Backend');
await lens.screenshot('out/03-collapsed.png');

await browser.close();
```

Run any ad-hoc script with:
```bash
node my-script.mjs
```

The existing demo script `screenshot.mjs` in the repo root uses this page object and captures five canonical screenshots to `sample-data/`.
