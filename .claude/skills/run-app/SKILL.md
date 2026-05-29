---
name: run-app
description: Run the ConwayLens app and interact with it via Playwright using the LensPage page object model
---

# Run ConwayLens app

## Prerequisites

The dev server must already be running on port 5174:
```bash
cd app && npx vite --port 5174 > /tmp/vite.log 2>&1 &
sleep 4 && curl -s -o /dev/null -w "%{http_code}" http://localhost:5174
mkdir -p out
```

Install dependencies if not already present:
```bash
cd playwright && npm install
```

## Page Object Model

All Playwright automation uses the `LensPage` class at `playwright/lens-page.mjs`.

```js
import { chromium } from 'playwright';
import { LensPage }  from './playwright/lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);          // opens http://localhost:5174
```

### Available operations

| Method | What it does |
|--------|-------------|
| `await lens.loadCSV('playwright/TimelineData.csv')` | Upload CSV via the Load file button |
| `await lens.importMappings('playwright/mappings.json')` | Open Mapping panel, import JSON, close panel |
| `await lens.expandNode('Backend')` | Click a named SVG node to expand it; waits for simulation |
| `await lens.collapseNode('Backend')` | Click a named SVG node to collapse it; waits for simulation |
| `await lens.hoverNode('Backend')` | Hover over a node and return tooltip text |
| `await lens.openRepoDetail('backend-api')` | Click a repo node to open the detail graph (omit name for first repo) |
| `await lens.measureTeamTooltipDirection()` | Hover team anchor, return `{ isBelow, isLeft, anchorX, tipLeft, … }` |
| `await lens.measureBadgeGeometry()` | Return `[{ label, r, textHalfW, gap }]` for pct badge circles in detail view |
| `await lens.getRepoLabels()` | Return `[{ label }]` for all repo nodes in swimlane (shows truncation) |
| `await lens.screenshot('out/foo.png')` | Save a screenshot (path relative to repo root) |

### Full example

```js
import { chromium } from 'playwright';
import { LensPage }  from './playwright/lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);

await lens.loadCSV('playwright/TimelineData.csv');
await lens.importMappings('playwright/mappings.json');
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

The existing demo script `playwright/screenshot.mjs` uses this page object and captures five canonical screenshots to `out/`.
