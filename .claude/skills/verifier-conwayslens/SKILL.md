---
name: verifier-conwayslens
description: Verify visual behaviour of the ConwayLens swimlane and repo-detail graphs using Playwright. Use for changes that touch NetworkGraph.vue, useSwimlaneGraph.js, useRepoDetailGraph.js, or graphConstants.js.
---

# ConwayLens Visual Verifier

> For server startup, Playwright import, POM basics, and the standard data-load sequence
> see the **run-app** skill. This skill only documents the graph-specific measurement
> patterns built on top of `LensPage`.

---

## Verification patterns

### 1 · Swimlane screenshot

Captures the swimlane at rest. Use to confirm layout, initial position, node count.

```js
await lens.screenshot('out/swimlane.png');
```

### 2 · Repo label truncation

Confirms long repo names are truncated with `…` and short names are untouched.

```js
const labels = await lens.getRepoLabels();
labels.forEach(({ label }) => console.log(' ', JSON.stringify(label)));
const truncated = labels.filter(l => l.label.includes('…'));
console.log('Truncated count:', truncated.length);
```

### 3 · Team tooltip direction (bottom-left)

Hovers the first team anchor in the swimlane and checks the tooltip opens
below and to the left of the cursor.

```js
const pos = await lens.measureTeamTooltipDirection();
console.log('anchorX:', pos.anchorX.toFixed(0), 'anchorY:', pos.anchorY.toFixed(0));
console.log('tipLeft:', pos.tipLeft.toFixed(0), 'tipRight:', pos.tipRight.toFixed(0));
console.log('isBelow:', pos.isBelow, '  isLeft:', pos.isLeft);
// PASS when isBelow === true && isLeft === true
```

### 4 · Repo detail — center node size

Opens the detail graph for the first repo and checks the central circle radius.

```js
await lens.openRepoDetail();                  // or openRepoDetail('backend-api')
const repoR = await lens.page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('svg circle'))
    .find(c => parseFloat(c.getAttribute('r')) > 30
            && c.getAttribute('fill-opacity') === '0.45');
  return c ? parseFloat(c.getAttribute('r')) : null;
});
console.log('Center repo radius:', repoR);    // expect 44
await lens.screenshot('out/repo-detail.png');
```

### 5 · Pct badge padding

Checks every pct badge circle in the detail graph: the gap between the text
edge and the circle boundary must be ≥ 4 px.

```js
// Optionally expand a team first to get individual-author badges:
await lens.expandNode('Backend');
await lens.page.waitForTimeout(600);

const badges = await lens.measureBadgeGeometry();
badges.forEach(b => console.log(`  "${b.label}"  r=${b.r}  gap=${b.gap}px`));
const failing = badges.filter(b => b.gap < 4);
console.log('Failing badges (gap < 4px):', failing.length);  // expect 0
```

---

## Full verification script template

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { LensPage }  from './playwright/lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);
await lens.loadCSV('sample-data/TimelineData.csv');
await lens.importMappings('sample-data/mappings.json');
await lens.page.waitForTimeout(800);

// ── Swimlane ──────────────────────────────────────────────────────────────
await lens.screenshot('out/01-swimlane.png');

const labels = await lens.getRepoLabels();
console.log('Repo labels:', labels.map(l => l.label));

const ttPos = await lens.measureTeamTooltipDirection();
console.log('Team tooltip isBelow:', ttPos.isBelow, ' isLeft:', ttPos.isLeft);

// ── Repo detail ───────────────────────────────────────────────────────────
await lens.openRepoDetail();
await lens.screenshot('out/02-detail.png');

await lens.expandNode('Backend');
await lens.page.waitForTimeout(600);
await lens.screenshot('out/03-detail-expanded.png');

const badges = await lens.measureBadgeGeometry();
badges.forEach(b => console.log(`badge "${b.label}": r=${b.r} gap=${b.gap}px`));
const failing = badges.filter(b => b.gap < 4);
console.log('PASS:', !failing.length);

await browser.close();
```

Run with:
```bash
node verify.mjs
```
