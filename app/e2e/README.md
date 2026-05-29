# e2e scripts

Playwright scripts for verifying ConwayLens visually. All commands run from `app/`.

## Setup

```bash
npm install
npx vite --port 5174 > /tmp/vite.log 2>&1 &
sleep 4 && curl -s -o /dev/null -w "%{http_code}" http://localhost:5174
mkdir -p out
```

## Running

```bash
npm run e2e        # verify-folders + verify-folder-width
npm run screenshot # capture canonical screenshots to out/
```

## Writing ad-hoc scripts

Create a `.mjs` file and run it with `node` from `app/`:

```js
import { chromium } from 'playwright';
import { LensPage }  from './e2e/lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);
await lens.loadCSV('e2e/TimelineData.csv');
await lens.importMappings('e2e/mappings.json');

// ... your verification here ...

await browser.close();
```

```bash
node my-script.mjs
```

## LensPage API

| Method | What it does |
|--------|-------------|
| `await lens.loadCSV('e2e/TimelineData.csv')` | Upload CSV via drag-drop simulation |
| `await lens.importMappings('e2e/mappings.json')` | Open Mapping panel, import JSON, close panel |
| `await lens.expandNode('Backend')` | Click a named SVG node to expand it; waits for simulation |
| `await lens.collapseNode('Backend')` | Click a named SVG node to collapse it; waits for simulation |
| `await lens.hoverNode('Backend')` | Hover over a node and return tooltip text |
| `await lens.openRepoDetail('backend-api')` | Click a repo node to open the detail graph (omit name for first repo) |
| `await lens.measureTeamTooltipDirection()` | Hover team anchor, return `{ isBelow, isLeft, anchorX, tipLeft, … }` |
| `await lens.measureBadgeGeometry()` | Return `[{ label, r, textHalfW, gap }]` for pct badge circles in detail view |
| `await lens.getRepoLabels()` | Return `[{ label }]` for all repo nodes in swimlane (shows truncation) |
| `await lens.screenshot('out/foo.png')` | Save a screenshot (path relative to `app/`) |
