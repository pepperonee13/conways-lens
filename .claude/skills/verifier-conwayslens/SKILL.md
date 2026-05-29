---
name: verifier-conwayslens
description: Verify visual behaviour of the ConwayLens swimlane and repo-detail graphs using Playwright. Use for changes that touch NetworkGraph.vue, useSwimlaneGraph.js, useRepoDetailGraph.js, or graphConstants.js.
---

# ConwayLens Visual Verifier

> For server startup, dependencies, and the LensPage API see the **run-app** skill.

Run the full suite:
```bash
cd app && npm run e2e
```

---

## Measurement patterns for ad-hoc verification

### Repo label truncation

```js
const labels = await lens.getRepoLabels();
labels.forEach(({ label }) => console.log(' ', JSON.stringify(label)));
const truncated = labels.filter(l => l.label.includes('…'));
console.log('Truncated count:', truncated.length);
```

### Team tooltip direction (expect: below and to the left)

```js
const pos = await lens.measureTeamTooltipDirection();
console.log('isBelow:', pos.isBelow, ' isLeft:', pos.isLeft);
```

### Repo detail — center node radius (expect: 44)

```js
await lens.openRepoDetail();   // or openRepoDetail('backend-api')
const repoR = await lens.page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('svg circle'))
    .find(c => parseFloat(c.getAttribute('r')) > 30
            && c.getAttribute('fill-opacity') === '0.45');
  return c ? parseFloat(c.getAttribute('r')) : null;
});
console.log('Center repo radius:', repoR);
```

### Pct badge padding (expect: gap ≥ 4 px on every badge)

```js
await lens.expandNode('Backend');
await lens.page.waitForTimeout(600);
const badges = await lens.measureBadgeGeometry();
const failing = badges.filter(b => b.gap < 4);
console.log('Failing badges:', failing.length);  // expect 0
```
